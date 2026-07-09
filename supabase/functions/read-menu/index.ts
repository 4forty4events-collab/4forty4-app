import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const sent = urls.slice(0, MAX_IMAGES);

    // Multimodal user message: a short instruction + every candidate image.
    const userContent = [
      { type: "text", text: `Find and read the menu among these ${sent.length} image(s).` },
      ...sent.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(market, currency) },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!aiResp.ok) {
      return json({ error: "ai_request_failed", detail: await aiResp.text() }, 502);
    }

    const aiData = await aiResp.json();
    const raw = (aiData.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return json({ error: "parse_failed", model_output: raw }, 200);
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
      images_read: sent.length,
    }, 200);
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
