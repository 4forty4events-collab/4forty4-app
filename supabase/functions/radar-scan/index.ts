import { createClient } from "jsr:@supabase/supabase-js@2";

// radar-scan -- the production seam for the Radar proximity engine. A client (the
// foreground simulator now; a background/geofence task later) posts the user's
// current { lat, lng }. We resolve the caller from their JWT, run the matching +
// dedupe pipeline (evaluate_radar_proximity) as the service role, and -- if that
// queued any notifications -- immediately flush the push channel (deliver-push)
// instead of waiting for its ~1-min cron. Returns the alert payloads.
//
// This keeps the matching output wired straight into the parked push channel, so the
// day production FCM/APNs keys land, live proximity alerts flow end to end.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { lat, lng, radius_m } = await req.json().catch(() => ({}));
    if (typeof lat !== "number" || typeof lng !== "number") {
      return json({ error: "lat and lng (numbers) are required." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify the caller from their bearer token.
    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Not authenticated." }, 401);

    // Run the pipeline as the service role (auth.uid() null -> may evaluate anyone).
    const admin = createClient(url, serviceKey);
    const args: Record<string, unknown> = { p_user_id: user.id, p_lat: lat, p_lng: lng };
    if (typeof radius_m === "number") args.p_radius_m = radius_m;

    const { data: alerts, error } = await admin.rpc("evaluate_radar_proximity", args);
    if (error) throw error;

    // If any fresh alert became a notification row, flush the push channel now.
    const queued = (alerts ?? []).filter((a: { notification_id?: string | null }) => a.notification_id);
    let flushed = false;
    if (queued.length > 0) {
      const secret = Deno.env.get("SCHEDULER_SECRET") ?? "";
      const resp = await fetch(`${url}/functions/v1/deliver-push`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-scheduler-secret": secret,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: "{}",
      }).catch(() => null);
      flushed = !!resp?.ok;
    }

    return json({ alerts: alerts ?? [], queued: queued.length, flushed });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
