import { createClient } from "jsr:@supabase/supabase-js@2";

// == Algiers grid-harvester :: STAGE A (orchestration skeleton) ===============
// A resumable, capped, monitorable background batch that sweeps Algiers one
// SECTOR at a time. It does NOT scrape itself -- each sector delegates to the
// proven `ingest-brightdata` discover engine (forwarding the admin JWT), so all
// the Bright Data / R2 / dedup logic lives in one place. State lives in
// harvest_runs / harvest_sectors so a sweep survives across invocations.
//
// THE RULE: one short step per invocation (start a sector, or poll a scraping
// sector, or finish one). The app polls `tick` repeatedly to advance the sweep,
// so no single invocation blocks long enough to time out.
//
// SAFETY RAILS: a hard per-run venue cap (`max_venues`) checked before every new
// sector; pause/resume; resume-from-next-pending (finished sectors never re-run,
// and dedup on google_place_id makes sector overlap harmless).
//
// STAGE B (later): set run.enrich=true to also run Step-2 enrichment per new
// venue (menu + categorized photos). The cap then governs enrichment spend too.
// Keep this file ASCII-clean (the Bun-based functions deploy crashes otherwise).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

// Algiers neighborhood grid: named centroids (approx). Using NAMED areas instead
// of a blind bbox grid gives every sector a label that (a) is stored as venue.city
// and (b) drives the neighborhood price multiplier in ingest-brightdata. Coords are
// approximate; tune as needed. Overlap between sectors is fine (dedup absorbs it).
const ALGIERS_GRID: { name: string; lat: number; long: number }[] = [
  { name: "Alger Centre", lat: 36.7720, long: 3.0588 },
  { name: "Sidi M'Hamed", lat: 36.7560, long: 3.0530 },
  { name: "El Madania", lat: 36.7480, long: 3.0640 },
  { name: "Belouizdad", lat: 36.7480, long: 3.0790 },
  { name: "Bab El Oued", lat: 36.7950, long: 3.0500 },
  { name: "Casbah", lat: 36.7840, long: 3.0600 },
  { name: "Bologhine", lat: 36.8050, long: 3.0420 },
  { name: "Rais Hamidou", lat: 36.8130, long: 3.0250 },
  { name: "Bouzareah", lat: 36.7900, long: 3.0250 },
  { name: "El Biar", lat: 36.7680, long: 3.0290 },
  { name: "Hydra", lat: 36.7449, long: 3.0392 },
  { name: "Birkhadem", lat: 36.7170, long: 3.0490 },
  { name: "Bir Mourad Rais", lat: 36.7350, long: 3.0470 },
  { name: "Gue de Constantine", lat: 36.7000, long: 3.0750 },
  { name: "Kouba", lat: 36.7250, long: 3.0820 },
  { name: "Hussein Dey", lat: 36.7400, long: 3.0950 },
  { name: "Bachdjarrah", lat: 36.7250, long: 3.1050 },
  { name: "El Harrach", lat: 36.7180, long: 3.1370 },
  { name: "Bourouba", lat: 36.7150, long: 3.1200 },
  { name: "Oued Smar", lat: 36.7050, long: 3.1550 },
  { name: "Mohammadia", lat: 36.7350, long: 3.1650 },
  { name: "Bab Ezzouar", lat: 36.7170, long: 3.1850 },
  { name: "Bordj El Kiffan", lat: 36.7480, long: 3.1930 },
  { name: "Dar El Beida", lat: 36.7130, long: 3.2120 },
  { name: "Bordj El Bahri", lat: 36.7950, long: 3.2350 },
  { name: "El Marsa", lat: 36.8050, long: 3.2450 },
  { name: "Ain Taya", lat: 36.7950, long: 3.2880 },
  { name: "Ben Aknoun", lat: 36.7570, long: 3.0140 },
  { name: "Dely Brahim", lat: 36.7560, long: 2.9930 },
  { name: "Cheraga", lat: 36.7670, long: 2.9560 },
  { name: "Ouled Fayet", lat: 36.7440, long: 2.9760 },
  { name: "Ain Benian", lat: 36.8020, long: 2.9230 },
  { name: "Staoueli", lat: 36.7530, long: 2.8870 },
  { name: "Zeralda", lat: 36.7140, long: 2.8420 },
  { name: "Draria", lat: 36.7220, long: 2.9990 },
  { name: "Saoula", lat: 36.7050, long: 3.0250 },
  { name: "Baba Hassen", lat: 36.7140, long: 2.9760 },
  { name: "Birtouta", lat: 36.6470, long: 2.9930 },
];

// B2 breadth: the fixed keyword set every sector sweeps when a run is started with
// breadth=true. Each entry is the Google search term + a FALLBACK category (the real
// per-venue category is still derived from each venue's own Google category in
// ingest-brightdata; this only applies when that mapping finds nothing). Covers
// food + cafes + lodging + the full ACTIVITY mix (outdoor, culture, entertainment,
// tourism, sports, wellness). Dedup on google_place_id absorbs the overlap (a
// restaurant surfacing under "things to do", etc).
//
// ORDER MATTERS: the sweep is area-major and the venue cap stops starting new
// sectors once it's hit, so a capped run in a dense central area would otherwise
// fill up on the first few keywords. Activities are therefore interleaved with
// and front-loaded ahead of food so a capped sweep returns a real category MIX
// (restaurants + museums + parks + attractions...), not just food.
const KEYWORD_SET: { keyword: string; category: string }[] = [
  { keyword: "restaurants", category: "restaurant" },
  { keyword: "museums", category: "culture" },
  { keyword: "parks and gardens", category: "outdoor" },
  { keyword: "cafes and coffee shops", category: "cafe" },
  { keyword: "tourist attractions and landmarks", category: "tourism" },
  { keyword: "entertainment and amusement", category: "entertainment" },
  { keyword: "art galleries", category: "culture" },
  { keyword: "beaches", category: "outdoor" },
  { keyword: "hotels", category: "hotel" },
  { keyword: "cinemas", category: "entertainment" },
  { keyword: "sports complexes", category: "sports" },
  { keyword: "monuments and historical sites", category: "culture" },
  { keyword: "outdoor activities", category: "outdoor" },
  { keyword: "bowling and arcades", category: "entertainment" },
  { keyword: "gyms and fitness", category: "wellness" },
  { keyword: "spas and hammams", category: "wellness" },
];

// == ACTIVITIES HARVEST (keyword-first) =======================================
// Sparse categories don't grid-search well: one WIDE low-zoom pass per keyword
// covers the metro far cheaper than grid x keyword. Coastal keywords sweep three
// coast points (Zeralda -> center -> Ain Taya) to span the strip. French-first
// (dominant on Google Maps Algeria); Arabic via \u escapes to keep this file pure
// ASCII (the Bun deploy crashes on raw non-ASCII). Tier 3 (dense food) stays grid.
const ALGIERS_CENTER = { name: "Algiers Metro", lat: 36.7538, long: 3.0588 };
const COAST_POINTS = [
  { name: "Coast West (Zeralda)", lat: 36.7140, long: 2.8420 },
  { name: "Coast Center", lat: 36.7950, long: 3.0500 },
  { name: "Coast East (Ain Taya)", lat: 36.7950, long: 3.2880 },
];
const WIDE_ZOOM = 12; // one pass ~ the whole metro for a sparse category

type TierKw = { keyword: string; category: string; coastal?: boolean };
// Tier 1 -- the proven-missing DO-THINGS set (side-by-side vs ChatGPT showed the
// gap is here). INTENSE activities are front-loaded: the sweep is keyword-major
// and the venue cap stops starting new keywords once hit, so a capped run fills
// the karting/paintball/escape gap FIRST, before the denser parks/beaches. Fallback
// category (used only when a venue's own Google type maps to nothing) is set so
// pricing is sane: entertainment/wellness/sports = paid, outdoor base 0 = FREE
// (beaches, parks, viewpoints, promenades). Coastal keywords sweep the 3 coast
// points. Arabic via \u escapes to keep this file pure ASCII (Bun deploy panics
// on raw non-ASCII).
const TIER1: TierKw[] = [
  // Intense do-things (the biggest gap) -- sparse, so cheap to sweep wide.
  { keyword: "karting", category: "entertainment" },
  { keyword: "go kart", category: "entertainment" },
  { keyword: "kart racing", category: "entertainment" },
  { keyword: "paintball", category: "entertainment" },
  { keyword: "laser game", category: "entertainment" },
  { keyword: "laser tag", category: "entertainment" },
  { keyword: "escape game", category: "entertainment" },
  { keyword: "escape room", category: "entertainment" },
  { keyword: "jeu d'evasion", category: "entertainment" },
  { keyword: "bowling", category: "entertainment" },
  { keyword: "rage room", category: "entertainment" },
  { keyword: "trampoline park", category: "entertainment" },
  { keyword: "parc aventure", category: "entertainment" },
  { keyword: "accrobranche", category: "entertainment" },
  { keyword: "parc aquatique", category: "entertainment" },
  // Water + nautical.
  { keyword: "piscine", category: "wellness" },
  { keyword: "jet ski", category: "sports", coastal: true },
  { keyword: "club nautique", category: "sports", coastal: true },
  // Wellness.
  { keyword: "hammam", category: "wellness" },
  { keyword: String.fromCharCode(0x62d, 0x645, 0x627, 0x645), category: "wellness" }, // hammam (AR)
  { keyword: "spa", category: "wellness" },
  // Outdoor / mostly-free: beaches, parks, viewpoints, promenades, cable car.
  { keyword: "plage", category: "outdoor", coastal: true },
  { keyword: "parc", category: "outdoor" },
  { keyword: "jardin", category: "outdoor" },
  { keyword: "foret", category: "outdoor" },
  { keyword: "point de vue", category: "outdoor" },
  { keyword: "promenade", category: "outdoor", coastal: true },
  { keyword: "corniche", category: "outdoor", coastal: true },
  { keyword: "telepherique", category: "outdoor" },
];
// Tier 2 -- culture & chill variety.
const TIER2: TierKw[] = [
  { keyword: "musee", category: "culture" },
  { keyword: String.fromCharCode(0x645, 0x62a, 0x62d, 0x641), category: "culture" }, // musee (AR)
  { keyword: "palais", category: "culture" },
  { keyword: "galerie d'art", category: "culture" },
  { keyword: "cinema", category: "entertainment" },
  { keyword: "marina", category: "outdoor", coastal: true },
  { keyword: "club nautique", category: "sports", coastal: true },
  { keyword: "jet ski", category: "sports", coastal: true },
  { keyword: "equitation", category: "sports" },
  { keyword: "quad", category: "sports" },
];
// Tier 3 -- food diversity where thin (dense -> grid x keyword like breadth).
const TIER3: TierKw[] = [
  { keyword: "rooftop", category: "restaurant" },
  { keyword: "salon de the", category: "cafe" },
  { keyword: "glacier", category: "cafe" },
  { keyword: "brunch", category: "restaurant" },
];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Delegate one discovery call to ingest-brightdata, forwarding the admin's JWT so
// that function's own admin gate passes. Returns its JSON (snapshot trigger, a
// pending poll, or a ready ingest result), or an {error} we can record on a sector.
async function callDiscover(authHeader: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-brightdata`, {
      method: "POST",
      headers: { "Authorization": authHeader, "apikey": ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ action: "discover", ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data?.error) return { error: `ingest-brightdata HTTP ${res.status}` };
    return data;
  } catch (e) {
    return { error: String((e as Error).message ?? e) };
  }
}

// Categories where a menu matters -> Stage B enriches these (skips parks/outdoor
// /shopping/etc). Mirrors MENU_RELEVANT in ingest-brightdata; menu_status is only
// set to 'pending_manual' for these at discovery, so it doubles as the enrich queue.
const ENRICH_CATEGORIES = ["restaurant", "cafe", "hotel", "nightlife"];

// Delegate one enrichment call to ingest-brightdata (Step-2 collect-by-URL). On
// trigger pass place_id (it resolves google_maps_url); on poll pass snapshot_id +
// place_id. Returns its JSON (snapshot trigger, pending poll, or done), or {error}.
async function callEnrich(authHeader: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-brightdata`, {
      method: "POST",
      headers: { "Authorization": authHeader, "apikey": ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ action: "enrich", ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data?.error) return { error: `ingest-brightdata HTTP ${res.status}` };
    return data;
  } catch (e) {
    return { error: String((e as Error).message ?? e) };
  }
}

// Compact progress payload the admin screen renders + polls on.
function progress(run: Record<string, unknown>, phase: string, message: string, extra: Record<string, unknown> = {}) {
  return json({
    ok: true,
    phase, // 'scraping' | 'sector_done' | 'enriching' | 'enriched' | 'capped' | 'done' | 'paused' | 'idle'
    message,
    run: {
      id: run.id,
      status: run.status,
      venues_ingested: run.venues_ingested,
      max_venues: run.max_venues,
      sectors_done: run.sectors_done,
      sectors_total: run.sectors_total,
      enrich: run.enrich,
      venues_enriched: run.venues_enriched ?? 0,
      enrich_failed: run.enrich_failed ?? 0,
    },
    ...extra,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const { action = "tick", run_id } = body;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Auth gate -- admin only (same contract as ingest-brightdata).
    const authed = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Not authenticated." }, 401);
    const { data: isAdmin } = await authed.rpc("is_admin");
    if (!isAdmin) return json({ error: "Admin only." }, 403);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- START: create a run + seed its sectors from the grid. ----------------
    if (action === "start") {
      const market = body.market === "ZW" ? "ZW" : "DZ";
      const maxVenues = Math.min(Math.max(parseInt(String(body.max_venues), 10) || 100, 1), 5000);
      const keyword = (typeof body.keyword === "string" && body.keyword.trim()) ? body.keyword.trim() : "restaurants";
      const category = (typeof body.category === "string" && body.category) ? body.category : "restaurant";
      let zoom = Math.min(Math.max(parseInt(String(body.zoom_level), 10) || 14, 10), 18);
      const enrich = body.enrich === true; // Stage A: leave false
      const breadth = body.breadth === true; // B2: sweep KEYWORD_SET x grid
      // mode 'keyword' = activities harvest (tier keyword-first). tier 1/2 = one wide
      // pass per keyword (coastal keywords across 3 coast points); tier 3 = food grid.
      const mode = typeof body.mode === "string" ? body.mode : (breadth ? "breadth" : "single");
      const tier = Math.min(Math.max(parseInt(String(body.tier), 10) || 1, 1), 3);

      // Optional AREA TARGETING: restrict the grid sweep to specific neighborhoods.
      // Default (empty) = the whole grid (unchanged behavior). This is the fix for
      // under-covered outer areas: the sweep is area-major from the center, and the
      // venue cap stops starting new sectors once hit, so a capped run never reaches
      // Bab Ezzouar (idx 21) / Cheraga (idx 28) / other suburbs + their malls. Picking
      // them here sweeps ONLY those, so coverage no longer depends on an enormous cap.
      // Applies to the grid modes (breadth/single/tier-3 food); tier 1/2 are metro-wide
      // single/coast passes that already span the suburbs, so the filter is a no-op there.
      const areaFilter = Array.isArray(body.areas)
        ? (body.areas as unknown[]).filter((a): a is string => typeof a === "string")
        : [];
      const grid = areaFilter.length
        ? ALGIERS_GRID.filter((s) => areaFilter.includes(s.name))
        : ALGIERS_GRID;
      if (areaFilter.length && grid.length === 0) {
        return json({ error: "No matching areas.", detail: `Unknown area name(s): ${areaFilter.join(", ")}` }, 400);
      }
      const areaNote = areaFilter.length ? ` [targeted: ${grid.map((s) => s.name).join(", ")}]` : "";

      // Each sector stores its own keyword/category so the tick loop is unchanged.
      let sectorPlan: { name: string; lat: number; long: number; keyword: string; category: string }[];
      let planNote: string;
      if (mode === "keyword") {
        const set = tier === 1 ? TIER1 : tier === 2 ? TIER2 : TIER3;
        if (tier === 3) {
          sectorPlan = grid.flatMap((s) => set.map((k) => ({ name: s.name, lat: s.lat, long: s.long, keyword: k.keyword, category: k.category })));
          planNote = `tier 3 food: ${set.length} keywords x ${grid.length} areas${areaNote}`;
        } else {
          zoom = WIDE_ZOOM;
          sectorPlan = set.flatMap((k) => k.coastal
            ? COAST_POINTS.map((cp) => ({ name: cp.name, lat: cp.lat, long: cp.long, keyword: k.keyword, category: k.category }))
            : [{ name: ALGIERS_CENTER.name, lat: ALGIERS_CENTER.lat, long: ALGIERS_CENTER.long, keyword: k.keyword, category: k.category }]);
          planNote = `tier ${tier} keyword-first: ${set.length} keywords, wide zoom ${WIDE_ZOOM}`;
        }
      } else if (breadth) {
        sectorPlan = grid.flatMap((s) => KEYWORD_SET.map((k) => ({ name: s.name, lat: s.lat, long: s.long, keyword: k.keyword, category: k.category })));
        planNote = `${KEYWORD_SET.length} categories x ${grid.length} areas${areaNote}`;
      } else {
        sectorPlan = grid.map((s) => ({ name: s.name, lat: s.lat, long: s.long, keyword, category }));
        planNote = `keyword "${keyword}" x ${grid.length} areas${areaNote}`;
      }

      const { data: run, error: runErr } = await admin.from("harvest_runs").insert({
        market, status: "running", max_venues: maxVenues, keyword, category,
        zoom_level: zoom, enrich, sectors_total: sectorPlan.length,
      }).select("*").single();
      if (runErr || !run) return json({ error: "Could not create run.", detail: runErr?.message }, 500);

      const sectorRows = sectorPlan.map((s, i) => ({
        run_id: run.id, idx: i, neighborhood: s.name, lat: s.lat, long: s.long,
        keyword: s.keyword, category: s.category, status: "pending",
      }));
      const { error: secErr } = await admin.from("harvest_sectors").insert(sectorRows);
      if (secErr) return json({ error: "Could not seed sectors.", detail: secErr.message }, 500);

      return progress(run, "idle", `Run started: ${sectorPlan.length} sectors (${planNote}), cap ${maxVenues} venues. Poll 'tick' to sweep.`);
    }

    if (!run_id) return json({ error: "run_id is required." }, 400);

    // ---- STATUS / PAUSE / RESUME ----------------------------------------------
    if (action === "status" || action === "pause" || action === "resume") {
      if (action === "pause" || action === "resume") {
        await admin.from("harvest_runs")
          .update({ status: action === "pause" ? "paused" : "running", updated_at: new Date().toISOString() })
          .eq("id", run_id).in("status", action === "pause" ? ["running"] : ["paused"]);
      }
      const { data: run } = await admin.from("harvest_runs").select("*").eq("id", run_id).maybeSingle();
      if (!run) return json({ error: "Run not found." }, 404);
      return progress(run, run.status === "running" ? "idle" : run.status,
        action === "pause" ? "Paused." : action === "resume" ? "Resumed." : "Status.");
    }

    // ---- RETRY FAILED: re-queue sectors a transient error dropped. -------------
    // A sector that errors is marked 'failed', counted as done, and never revisited,
    // so one Bright Data hiccup would leave that area+keyword PERMANENTLY missing --
    // the opposite of "nothing left out". This flips every failed sector back to
    // 'pending', rolls sectors_done back by that count, and sets the run running so
    // the tick loop sweeps them again (dedup makes re-running scraped areas harmless).
    if (action === "retry_failed") {
      const { data: run } = await admin.from("harvest_runs").select("*").eq("id", run_id).maybeSingle();
      if (!run) return json({ error: "Run not found." }, 404);
      const { count: failedCount } = await admin.from("harvest_sectors")
        .select("id", { count: "exact", head: true }).eq("run_id", run_id).eq("status", "failed");
      const n = failedCount ?? 0;
      if (n === 0) return progress(run, run.status, "No failed sectors to retry.");
      await admin.from("harvest_sectors")
        .update({ status: "pending", error: null, snapshot_id: null })
        .eq("run_id", run_id).eq("status", "failed");
      const { data: u } = await admin.from("harvest_runs").update({
        status: "running", sectors_done: Math.max(0, run.sectors_done - n), updated_at: new Date().toISOString(),
      }).eq("id", run_id).select("*").single();
      return progress(u ?? run, "idle", `Re-queued ${n} failed sector(s). Poll 'tick' to sweep them.`);
    }

    // ---- TICK: advance the sweep by ONE step. ---------------------------------
    if (action === "tick") {
      const { data: run } = await admin.from("harvest_runs").select("*").eq("id", run_id).maybeSingle();
      if (!run) return json({ error: "Run not found." }, 404);
      if (run.status !== "running") {
        return progress(run, run.status, `Run is ${run.status}; not advancing.`);
      }

      const nowIso = () => new Date().toISOString();

      // === DISCOVERY PHASE =====================================================
      // (1) A sector mid-scrape? Poll it (one progress check). Status stays
      // 'running' on ready -- the cap is enforced at the discovery gate below, and
      // (for enrich runs) discovery then flows into the enrichment phase.
      const { data: scraping } = await admin.from("harvest_sectors")
        .select("*").eq("run_id", run_id).eq("status", "scraping").order("idx").limit(1).maybeSingle();

      if (scraping) {
        const res = await callDiscover(authHeader, {
          market: run.market, snapshot_id: scraping.snapshot_id,
          city: scraping.neighborhood, category: scraping.category ?? run.category,
        });
        if (res?.error) {
          await admin.from("harvest_sectors").update({ status: "failed", error: String(res.error), updated_at: nowIso() }).eq("id", scraping.id);
          const { data: u } = await admin.from("harvest_runs").update({ sectors_done: run.sectors_done + 1, updated_at: nowIso() }).eq("id", run_id).select("*").single();
          return progress(u ?? run, "sector_done", `Sector ${scraping.idx + 1} (${scraping.neighborhood}) failed: ${res.error}`);
        }
        if (res?.pending) {
          return progress(run, "scraping", `Sector ${scraping.idx + 1}/${run.sectors_total} (${scraping.neighborhood}) scraping...`);
        }
        const imported = Number(res?.imported ?? 0);
        await admin.from("harvest_sectors").update({ status: "done", venues_found: imported, snapshot_id: null, updated_at: nowIso() }).eq("id", scraping.id);
        const { data: u } = await admin.from("harvest_runs").update({
          venues_ingested: run.venues_ingested + imported, sectors_done: run.sectors_done + 1, updated_at: nowIso(),
        }).eq("id", run_id).select("*").single();
        const kw = scraping.keyword ? ` ${scraping.keyword}` : "";
        return progress(u ?? run, "sector_done", `Sector ${scraping.idx + 1}/${run.sectors_total} (${scraping.neighborhood}${kw}): +${imported} new (${(u ?? run).venues_ingested} total).`);
      }

      // (2) No sector scraping. Start the next pending sector IF under the cap.
      if (run.venues_ingested < run.max_venues) {
        const { data: next } = await admin.from("harvest_sectors")
          .select("*").eq("run_id", run_id).eq("status", "pending").order("idx").limit(1).maybeSingle();
        if (next) {
          const remaining = run.max_venues - run.venues_ingested;
          const count = Math.max(1, Math.min(100, remaining));
          const res = await callDiscover(authHeader, {
            market: run.market, keyword: next.keyword ?? run.keyword, lat: next.lat, long: next.long,
            zoom_level: run.zoom_level, count, city: next.neighborhood,
            category: next.category ?? run.category,
          });
          if (res?.error) {
            await admin.from("harvest_sectors").update({ status: "failed", error: String(res.error), updated_at: nowIso() }).eq("id", next.id);
            const { data: u } = await admin.from("harvest_runs").update({ sectors_done: run.sectors_done + 1, updated_at: nowIso() }).eq("id", run_id).select("*").single();
            return progress(u ?? run, "sector_done", `Sector ${next.idx + 1} (${next.neighborhood}) failed to start: ${res.error}`);
          }
          if (res?.snapshot_id) {
            await admin.from("harvest_sectors").update({ status: "scraping", snapshot_id: res.snapshot_id, updated_at: nowIso() }).eq("id", next.id);
            const kw = next.keyword ? ` ${next.keyword}` : "";
            return progress(run, "scraping", `Sector ${next.idx + 1}/${run.sectors_total} (${next.neighborhood}${kw}) started scraping...`);
          }
          const imported = Number(res?.imported ?? 0);
          await admin.from("harvest_sectors").update({ status: "done", venues_found: imported, updated_at: nowIso() }).eq("id", next.id);
          const { data: u } = await admin.from("harvest_runs").update({
            venues_ingested: run.venues_ingested + imported, sectors_done: run.sectors_done + 1, updated_at: nowIso(),
          }).eq("id", run_id).select("*").single();
          return progress(u ?? run, "sector_done", `Sector ${next.idx + 1} (${next.neighborhood}): +${imported} new.`);
        }
      }

      // Discovery is exhausted (all sectors done) OR the venue cap was reached.
      const { count: pendingLeft } = await admin.from("harvest_sectors")
        .select("id", { count: "exact", head: true }).eq("run_id", run_id).eq("status", "pending");
      const discoveryCapped = (pendingLeft ?? 0) > 0; // stopped early by the cap

      // === ENRICHMENT PHASE (Stage B) =========================================
      // Discovery-only runs stop here. Enrich runs continue: drain the
      // pending_manual queue (menu-bearing venues only), one venue per tick.
      if (!run.enrich) {
        const finalStatus = discoveryCapped ? "capped" : "done";
        const { data: u } = await admin.from("harvest_runs").update({ status: finalStatus, updated_at: nowIso() }).eq("id", run_id).select("*").single();
        return progress(u ?? run, finalStatus, discoveryCapped
          ? `Discovery cap reached (${run.venues_ingested}/${run.max_venues}). ${pendingLeft} sectors left. Raise cap + continue.`
          : `Discovery complete: ${run.sectors_done}/${run.sectors_total} sectors, ${run.venues_ingested} venues.`);
      }

      // (E1) An enrichment mid-flight? Poll it.
      if (run.enrich_snapshot) {
        const res = await callEnrich(authHeader, { market: run.market, snapshot_id: run.enrich_snapshot, place_id: run.enrich_place_id });
        if (res?.error) {
          const { data: u } = await admin.from("harvest_runs").update({
            enrich_failed: (run.enrich_failed ?? 0) + 1, enrich_snapshot: null, enrich_place_id: null, updated_at: nowIso(),
          }).eq("id", run_id).select("*").single();
          return progress(u ?? run, "enriched", `Enrich failed for one venue (${res.error}). Left as pending_manual.`);
        }
        if (res?.pending) {
          return progress(run, "enriching", `Enriching venue ${(run.venues_enriched ?? 0) + 1} (~2 min)...`);
        }
        const items = Number(res?.menu_items ?? 0);
        const { data: u } = await admin.from("harvest_runs").update({
          venues_enriched: (run.venues_enriched ?? 0) + 1, enrich_snapshot: null, enrich_place_id: null, updated_at: nowIso(),
        }).eq("id", run_id).select("*").single();
        return progress(u ?? run, "enriched", `Enriched "${res?.venue ?? "venue"}": ${items} menu items, ${Number(res?.images ?? 0)} photos.`);
      }

      // (E2) Enrichment cap: bound enrichment spend by the same max_venues.
      if ((run.venues_enriched ?? 0) >= run.max_venues) {
        const { data: u } = await admin.from("harvest_runs").update({ status: "capped", updated_at: nowIso() }).eq("id", run_id).select("*").single();
        return progress(u ?? run, "capped", `Enrichment cap reached (${run.venues_enriched}/${run.max_venues}).`);
      }

      // (E3) Pick the next un-enriched menu-bearing venue (the pending_manual queue).
      const { data: target } = await admin.from("venues")
        .select("id, name, google_place_id")
        .eq("market", run.market).eq("source", "google_maps_scrape")
        .eq("menu_status", "pending_manual").in("category", ENRICH_CATEGORIES)
        .is("enrich_attempted_at", null).not("google_maps_url", "is", null)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();

      if (!target) {
        const { data: u } = await admin.from("harvest_runs").update({ status: "done", updated_at: nowIso() }).eq("id", run_id).select("*").single();
        return progress(u ?? run, "done",
          `Sweep complete: ${run.venues_ingested} venues, ${run.venues_enriched ?? 0} enriched (${run.enrich_failed ?? 0} failed).`);
      }

      // (E4) Mark attempted BEFORE triggering (so a failure can't loop), then trigger.
      await admin.from("venues").update({ enrich_attempted_at: nowIso() }).eq("id", target.id);
      const eres = await callEnrich(authHeader, { market: run.market, place_id: target.google_place_id });
      if (eres?.error) {
        const { data: u } = await admin.from("harvest_runs").update({ enrich_failed: (run.enrich_failed ?? 0) + 1, updated_at: nowIso() }).eq("id", run_id).select("*").single();
        return progress(u ?? run, "enriched", `Enrich failed to start for "${target.name}" (${eres.error}).`);
      }
      if (eres?.snapshot_id) {
        const { data: u } = await admin.from("harvest_runs").update({
          enrich_snapshot: eres.snapshot_id, enrich_place_id: target.google_place_id, updated_at: nowIso(),
        }).eq("id", run_id).select("*").single();
        return progress(u ?? run, "enriching", `Enriching "${target.name}" (~2 min)...`);
      }
      const items = Number(eres?.menu_items ?? 0);
      const { data: u } = await admin.from("harvest_runs").update({ venues_enriched: (run.venues_enriched ?? 0) + 1, updated_at: nowIso() }).eq("id", run_id).select("*").single();
      return progress(u ?? run, "enriched", `Enriched "${target.name}": ${items} menu items.`);
    }

    return json({ error: `Unknown action '${action}'.` }, 400);
  } catch (e) {
    return json({ error: "Unexpected error.", detail: String((e as Error).message ?? e) }, 500);
  }
});
