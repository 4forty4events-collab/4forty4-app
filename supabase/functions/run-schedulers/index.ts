import { createClient } from "jsr:@supabase/supabase-js@2";

// run-schedulers -- the periodic notification GENERATOR entrypoint. Invoked by a
// cron (about every 15 min). It calls the existing SECURITY DEFINER generators so
// scheduling logic lives in one place; the rows they queue are delivered separately
// by deliver-push. Today it runs event reminders (saved events starting within 24h,
// deduped server-side). Add more generators here as they land (nearby / weather).
//
// Auth: shared SCHEDULER_SECRET header. Uses the service role (the generators are
// revoked from anon/authenticated).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("SCHEDULER_SECRET");
    if (secret && req.headers.get("x-scheduler-secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    // Event reminders for saved, soon-starting events (24h window).
    const { data: reminders, error } = await admin.rpc("enqueue_event_reminders", {
      p_within: "24:00:00",
    });
    if (error) throw error;

    return json({ event_reminders_queued: reminders ?? 0 });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
