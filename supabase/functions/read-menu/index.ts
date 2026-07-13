import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { decode as decodeImage, Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

// Menu OCR: read a venue's MENU photo(s) and extract (a) a real price range for
// the Budget Planner and (b) the full structured menu for the Detail screen.
// Admin-triggered from the venue Edit screen, vision model via the SAME
// OpenRouter setup + OPENROUTER_API_KEY as parse-listing (no new API/key).
//
// Two modes, same contract:
//   - auto-find: client sends the whole gallery; the model picks the menu image.
//   - manual:    client sends one chosen image; the model reads just that one.
// Either way it returns null/empty when no image is a readable menu (no
// hallucinated prices); the human reviews + saves in the Edit form.

const MARKET: Record<string, { currency: string }> = {
  DZ: { currency: "DZD" },
  ZW: { currency: "USD" },
};

// Cap how many gallery images we send in one vision call (cost control).
const MAX_IMAGES = 10;
// Per-image download timeout, and a size ceiling so one huge file can't blow up
// the vision payload / memory.
const IMAGE_FETCH_TIMEOUT_MS = 12000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

// Anthropic's vision endpoint downsizes anything past ~1568px on the long edge
// (~1.15 MP) anyway, so sending a full-res phone photo just burns tokens + adds
// latency (a prime cause of slow calls / timeouts on high-res menu shots).
// Shrink to that envelope and re-encode JPEG before base64. Best-effort: any
// decode/encode failure falls back to the ORIGINAL bytes so we never break a
// working image, and we skip small images entirely (not worth the CPU).
const VISION_MAX_EDGE = 1568;
const DOWNSCALE_THRESHOLD_BYTES = 600 * 1024;

async function optimizeForVision(bytes: Uint8Array): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const decoded = await decodeImage(bytes);
    if (!(decoded instanceof Image)) return null; // animated GIF etc. -- send as-is
    const longEdge = Math.max(decoded.width, decoded.height);
    if (longEdge > VISION_MAX_EDGE) {
      const scale = VISION_MAX_EDGE / longEdge;
      decoded.resize(Math.max(1, Math.round(decoded.width * scale)), Math.max(1, Math.round(decoded.height * scale)));
    }
    const out = await decoded.encodeJPEG(80);
    // Only adopt the re-encode if it actually shrank the payload.
    return out.byteLength < bytes.byteLength ? { bytes: out, mime: "image/jpeg" } : null;
  } catch {
    return null; // decode failed (unsupported/corrupt) -- caller keeps original
  }
}

// Download one external image server-side and return it as a base64 data URL.
// We fetch it ourselves (instead of handing the raw URL to the vision model) so
// hotlink/CORS/403/404 blocks surface HERE as a clean, catchable failure rather
// than a silent "no menu" from the model. Never throws -- returns {ok:false,...}.
async function fetchImageAsDataUrl(
  url: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false; status: number; reason: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      // A UA + referer-less request; some hosts 403 the default fetch UA.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; 4Forty4-MenuOCR/1.0)", "Accept": "image/*" },
    });
    if (!resp.ok) {
      // 403 (hotlink block), 404 (dead link), 401, etc.
      return { ok: false, status: resp.status, reason: `http_${resp.status}` };
    }
    const ct = resp.headers.get("content-type") ?? "";
    if (ct && !ct.startsWith("image/")) {
      // A login/HTML page served in place of the image (soft block).
      return { ok: false, status: resp.status, reason: `not_an_image:${ct.split(";")[0]}` };
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength === 0) return { ok: false, status: resp.status, reason: "empty_body" };
    if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, status: resp.status, reason: "too_large" };
    let outBytes = bytes;
    let mime = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
    // Downscale big photos to the vision-optimal envelope before base64.
    if (bytes.byteLength >= DOWNSCALE_THRESHOLD_BYTES) {
      const optimized = await optimizeForVision(bytes);
      if (optimized) { outBytes = optimized.bytes; mime = optimized.mime; }
    }
    return { ok: true, dataUrl: `data:${mime};base64,${encodeBase64(outBytes)}` };
  } catch (e) {
    // Network error, DNS failure, TLS error, or the abort/timeout above.
    const reason = (e as Error)?.name === "AbortError" ? "timeout" : `network:${String((e as Error)?.message ?? e)}`;
    return { ok: false, status: 0, reason };
  } finally {
    clearTimeout(timer);
  }
}

// Run an async mapper over items with a small concurrency cap. Image decoding
// (imagescript, pure JS) is memory-hungry; fetching+decoding all ~10 auto-find
// gallery images at once is what can push the worker past its memory/CPU budget and
// get it KILLED mid-flight -- which reaches the app as an opaque non-2xx (bypassing
// our own 200-with-a-code error handling). A pool of 3 keeps peak memory bounded
// while staying fast. Preserves input order.
async function mapPooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

function systemPrompt(market: string, currency: string) {
  return `You read MENU photos from a venue's gallery in ${market} (DZ = Algeria,
ZW = Zimbabwe) and extract structured menu + pricing data.

You are given one or more gallery images. Find the image(s) that are a MENU (a
list of dishes/drinks with prices) and read it. Ignore non-menu photos (food
shots, storefronts, interiors).

Return ONE JSON object and nothing else - no prose, no markdown, no code fences:
{
  "is_menu": boolean,
  "menu_items": [ { "section": string | null, "name": string, "description": string | null, "price": number | null } ],
  "price_min": number | null,
  "price_max": number | null,
  "currency": "DZD" | "USD" | null
}

Rules:
- is_menu: true only if at least one image is a readable menu with prices. If none
  is, return is_menu=false, menu_items=[], price_min/price_max/currency=null.
- NEVER invent prices. Extract only prices you can actually read in the image. An
  item whose price you cannot read gets price=null (still list the item).
- Menus are often in French, Arabic, Algerian Darija, or English, frequently
  mixed. Keep each item's name in its original language as written on the menu.
- price: a clean number only (strip currency symbols, spaces, "DA"/"DZD"/"$").
- price_min / price_max: the lowest and highest numeric item prices you read
  across the menu. These become the Budget Planner's per-person range.
- currency: default ${currency} for ${market}; override only if the menu clearly
  shows another currency.
- section: the menu section header (Entrees, Plats, Boissons, ...) if present,
  else null. Group items under the section they appear in.`;
}

// Best-effort JSON extraction from the model reply. Handles a clean JSON object,
// a ```json ... ``` fence, and the case where the model wraps its object in prose
// ("Here is the menu: { ... }") by grabbing the outermost {...} span.
function extractMenuJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const candidates = [fenced];
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(fenced.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const p = JSON.parse(c);
      if (p && typeof p === "object") return p as Record<string, unknown>;
    } catch { /* try the next candidate */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { image_urls, image_url, market } = await req.json().catch(() => ({}));
    // Accept an array (auto-find: whole gallery) or a single url (manual pick).
    const urls: string[] = Array.isArray(image_urls)
      ? image_urls.filter((u) => typeof u === "string" && u.trim())
      : (typeof image_url === "string" && image_url.trim() ? [image_url] : []);
    if (urls.length === 0) return json({ error: "Provide 'image_urls' or 'image_url'." }, 400);
    if (!MARKET[market]) return json({ error: "market must be 'DZ' or 'ZW'." }, 400);

    // Auth gate - admin only (same contract as parse-listing).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not authenticated." }, 401);
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) return json({ error: "Admin only." }, 403);

    const { currency } = MARKET[market];
    const candidates = urls.slice(0, MAX_IMAGES);

    // Download every candidate ourselves so hotlink/CORS/403/404 blocks are
    // caught here as a clean error instead of the model silently seeing nothing.
    const fetched = await mapPooled(candidates, 3, fetchImageAsDataUrl);
    const dataUrls = fetched.filter((r): r is { ok: true; dataUrl: string } => r.ok).map((r) => r.dataUrl);

    if (dataUrls.length === 0) {
      // Nothing could be fetched -- the URL(s) are blocked, dead, or not images.
      // Return 200 with a stable error CODE so the client can read data.error
      // (a non-2xx would reach the app only as an opaque "non-2xx status code").
      const failures = fetched.filter((r) => !r.ok).map((r) => (r as { reason: string }).reason);
      return json({ error: "IMAGE_FETCH_FAILED", failures }, 200);
    }

    // Multimodal user message: a short instruction + every candidate image
    // (now inlined as base64 data URLs).
    const userContent = [
      { type: "text", text: `Find and read the menu among these ${dataUrls.length} image(s).` },
      ...dataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const aiCtl = new AbortController();
    const aiTimer = setTimeout(() => aiCtl.abort(), 45000);
    let aiResp: Response;
    try {
      aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: aiCtl.signal,
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-haiku-4.5",
          response_format: { type: "json_object" },
          // Bound the reply: a menu rarely needs more, and an unbounded response
          // is what stretches the call toward the 45s abort on a busy day.
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt(market, currency) },
            { role: "user", content: userContent },
          ],
        }),
      });
    } catch (e) {
      // Network drop / TLS error / the 45s abort above. HTTP 200 + a stable code
      // so the client reads data.error instead of a bare "non-2xx status code".
      const reason = (e as Error)?.name === "AbortError" ? "ai_timeout" : "ai_network";
      return json({ ok: false, error: "VISION_PROCESSING_FAILED", reason, detail: String((e as Error)?.message ?? e) }, 200);
    } finally {
      clearTimeout(aiTimer);
    }

    // Read the body ONCE as text, then try to JSON-parse it. This survives an
    // OpenRouter error page / rate-limit HTML / truncated body without throwing.
    const rawBody = await aiResp.text().catch(() => "");
    let aiData: Record<string, unknown> | null = null;
    try {
      aiData = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      aiData = null;
    }

    if (!aiResp.ok) {
      // OpenRouter returned non-2xx (bad key, model unavailable, rate limit, ...).
      const detail =
        (aiData as { error?: { message?: string } } | null)?.error?.message ??
        rawBody.slice(0, 500);
      // For a 401 especially, note whether the key env var was even present -- a
      // missing secret sends "Bearer undefined" and gets 401. This makes the
      // "correct name / correct value / has credit" distinction diagnosable in-app.
      return json({
        ok: false,
        error: "VISION_PROCESSING_FAILED",
        reason: `ai_http_${aiResp.status}`,
        detail,
        key_present: !!Deno.env.get("OPENROUTER_API_KEY"),
      }, 200);
    }
    if (!aiData) {
      // 2xx but the body wasn't JSON we could read.
      return json({ ok: false, error: "VISION_PROCESSING_FAILED", reason: "ai_body_unreadable", detail: rawBody.slice(0, 500) }, 200);
    }

    // OpenRouter can return 200 with an { error: {...} } payload and no choices.
    const apiError = (aiData as { error?: { message?: string } }).error;
    const choices = (aiData as { choices?: Array<{ message?: { content?: string } }> }).choices;
    const raw = (choices?.[0]?.message?.content ?? "").trim();
    if (apiError || !raw) {
      return json({
        ok: false,
        error: "VISION_PROCESSING_FAILED",
        reason: apiError ? "ai_error_payload" : "ai_empty_output",
        detail: apiError?.message ?? null,
      }, 200);
    }

    const parsed = extractMenuJson(raw);
    if (!parsed) {
      // Malformed / non-JSON model output -- not a crash, just no usable menu.
      return json({ ok: false, error: "VISION_PROCESSING_FAILED", reason: "parse_failed", model_output: raw.slice(0, 1000) }, 200);
    }

    // Normalize to a stable shape regardless of what the model returned.
    const items = Array.isArray(parsed?.menu_items) ? parsed.menu_items : [];
    return json({
      ok: true,
      market,
      is_menu: parsed?.is_menu === true && items.length > 0,
      menu_items: items,
      price_min: typeof parsed?.price_min === "number" ? parsed.price_min : null,
      price_max: typeof parsed?.price_max === "number" ? parsed.price_max : null,
      currency: parsed?.currency === "DZD" || parsed?.currency === "USD" ? parsed.currency : currency,
      images_read: dataUrls.length,
    }, 200);
  } catch (e) {
    // Last-resort guard: NOTHING escapes as an unhandled throw / non-2xx. The
    // client always gets a readable code instead of the generic popup.
    return json({ ok: false, error: "VISION_PROCESSING_FAILED", reason: "unexpected", detail: String((e as Error)?.message ?? e) }, 200);
  }
});
