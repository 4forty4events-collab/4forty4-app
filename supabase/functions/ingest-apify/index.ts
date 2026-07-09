import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Instagram intake via Apify → content_drafts queue ──────────────────────────
// Admin-only, MANUAL TRIGGER ONLY (no cron): you pull when you sit down to do
// content. Pulls recent posts from a few roster accounts, drops each NEW post
// into content_drafts as a pending_review draft. Deliberately does NOT parse on
// ingest — a run can return 50 posts and we don't want 50 AI calls firing; the
// caption is parsed lazily only when you open the draft in triage.
//
// Dedup is the core: every post carries a shortCode; if that shortcode is already
// a draft we skip it. That's what makes a second run add nothing instead of
// refilling the queue with repeats.
//
// Cost note: Apify is pay-per-use with a free monthly allowance. A few accounts
// at a small resultsLimit should stay free — watch the Apify usage dashboard
// after the first runs, same discipline as Google.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

const MARKETS = new Set(["DZ", "ZW"]);

// Maintained Instagram scraper actor. Synchronous endpoint: it runs the actor
// and returns the dataset items in a single HTTP response (no separate poll).
const APIFY_ACTOR = "apify~instagram-scraper";
const APIFY_SYNC_URL =
  `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;

// Posts pulled per profile per run. Kept small on purpose: a roster sweep wants
// the latest handful from each account, not a full backfill (cost + queue noise).
const RESULTS_PER_PROFILE = 12;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { profiles, market } = await req.json().catch(() => ({}));
    if (!MARKETS.has(market)) return json({ error: "market must be 'DZ' or 'ZW'." }, 400);
    if (!Array.isArray(profiles) || profiles.length === 0) {
      return json({ error: "profiles must be a non-empty array of Instagram URLs." }, 400);
    }
    // Paste-anything-in: strip query strings (?igsh=…, ?hl=… share params) and
    // normalize to a single trailing slash so a copied IG share link cleans itself
    // into the canonical profile URL Apify expects.
    const directUrls = profiles
      .map((p: unknown) => String(p ?? "").trim())
      .filter((p: string) => p.length > 0)
      .map((p: string) => p.split(/[?#]/)[0].replace(/\/+$/, "") + "/");
    if (directUrls.length === 0) {
      return json({ error: "No valid profile URLs provided." }, 400);
    }

    // Auth gate — admin only, same as import-places / parse-listing / r2-presign.
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Not authenticated." }, 401);
    const { data: isAdmin } = await authed.rpc("is_admin");
    if (!isAdmin) return json({ error: "Admin only." }, 403);

    const apifyToken = Deno.env.get("APIFY_API_TOKEN");
    if (!apifyToken) return json({ error: "APIFY_API_TOKEN not configured." }, 500);

    // Trigger the actor and get the dataset back in one request. Token goes in the
    // query string per Apify's sync endpoint; the body is the actor input.
    let items: any[] = [];
    try {
      const resp = await fetch(`${APIFY_SYNC_URL}?token=${apifyToken}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directUrls,
          resultsType: "posts",
          resultsLimit: RESULTS_PER_PROFILE,
          addParentData: false,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        return json({ error: `Apify run failed (${resp.status}).`, detail: detail.slice(0, 500) }, 502);
      }
      items = await resp.json();
    } catch (e) {
      return json({ error: "Could not reach Apify.", detail: String((e as Error).message ?? e) }, 502);
    }
    if (!Array.isArray(items)) items = [];

    // Keep only real posts that carry a shortcode (our dedup key). Tolerate field
    // casing drift across actor versions by reading a couple of aliases.
    const posts = items
      .map((it) => ({
        shortcode: it?.shortCode ?? it?.shortcode ?? null,
        caption: it?.caption ?? "",
        imageUrl: it?.displayUrl ?? it?.imageUrl ?? (Array.isArray(it?.images) ? it.images[0] : null) ?? null,
        url: it?.url ?? null,
        username: it?.ownerUsername ?? it?.ownerFullName ?? null,
      }))
      .filter((p) => p.shortcode);

    const total = posts.length;
    if (total === 0) return json({ ok: true, total: 0, imported: 0, existed: 0, message: "No posts returned for those profiles." });

    // Service-role client for the queue write (bypasses RLS; we already proved
    // admin above and stamp created_by with the real admin id).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Dedup: which of these shortcodes are already drafts? Skip those — no re-add.
    const shortcodes = posts.map((p) => p.shortcode);
    const { data: existingRows, error: exErr } = await admin
      .from("content_drafts")
      .select("source_shortcode")
      .in("source_shortcode", shortcodes);
    if (exErr) return json({ error: "Dedup lookup failed.", detail: exErr.message }, 500);
    const seen = new Set((existingRows ?? []).map((r) => r.source_shortcode));

    // Drop already-queued shortcodes AND collapse intra-response repeats (a pinned
    // post can appear twice in one dataset) so the batch insert can't self-conflict.
    const freshMap = new Map<string, typeof posts[number]>();
    for (const p of posts) {
      if (seen.has(p.shortcode)) continue;
      if (!freshMap.has(p.shortcode)) freshMap.set(p.shortcode, p);
    }
    const fresh = [...freshMap.values()];
    const existed = total - fresh.length;

    if (fresh.length === 0) {
      return json({ ok: true, total, imported: 0, existed, message: `${existed} already in the queue — nothing new.` });
    }

    const rows = fresh.map((p) => ({
      created_by: user.id,
      market,
      source: "instagram",
      source_shortcode: p.shortcode,
      // raw_caption is NOT NULL; a captionless post still becomes a draft to triage.
      raw_caption: p.caption || `(no caption) ${p.url ?? ""}`.trim(),
      image_url: p.imageUrl,
      // Intake is the event layer; triage parses and can correct the type if needed.
      target_type: "event",
      status: "pending_review",
    }));

    // ignoreDuplicates on the shortcode index makes a concurrent/second run a no-op
    // rather than an error — belt-and-suspenders over the lookup above.
    const { data: inserted, error: insErr } = await admin
      .from("content_drafts")
      .upsert(rows, { onConflict: "source_shortcode", ignoreDuplicates: true })
      .select("id");
    if (insErr) return json({ error: "Queue insert failed.", detail: insErr.message }, 500);

    const imported = inserted?.length ?? 0;
    return json({
      ok: true,
      total,
      imported,
      existed: total - imported,
      message: `${imported} new post${imported === 1 ? "" : "s"} added to the Inbox · ${total - imported} already seen.`,
    });
  } catch (e) {
    return json({ error: "Unexpected error.", detail: String((e as Error).message ?? e) }, 500);
  }
});
