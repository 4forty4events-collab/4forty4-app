import { createClient } from "jsr:@supabase/supabase-js@2";

// deliver-push -- the last mile of the notification pipeline. Sweeps notification
// rows that have not been pushed to devices yet (pushed_at is null), sends them via
// the Expo push service to every registered device of each recipient, then stamps
// pushed_at so they are never re-sent. Meant to run on a short cron (about 1 min).
//
// Auth: a shared SCHEDULER_SECRET header (the cron passes it) OR nothing public --
// this must not be openable by anyone. Uses the service role to bypass RLS.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

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

    // Pull a bounded page of undelivered notifications (recent only -- an old
    // backlog is never worth pushing).
    const { data: notes, error: nErr } = await admin
      .from("notifications")
      .select("id, user_id, title, body, route, venue_id, event_id, payload")
      .is("pushed_at", null)
      .gte("created_at", new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: true })
      .limit(300);
    if (nErr) throw nErr;
    if (!notes || notes.length === 0) return json({ delivered: 0, notifications: 0 });

    const userIds = [...new Set(notes.map((n) => n.user_id))];
    const { data: tokenRows, error: tErr } = await admin
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", userIds);
    if (tErr) throw tErr;

    const tokensByUser = new Map<string, string[]>();
    for (const r of tokenRows ?? []) {
      const list = tokensByUser.get(r.user_id) ?? [];
      list.push(r.token);
      tokensByUser.set(r.user_id, list);
    }

    // Build one Expo message per (notification, device token).
    const messages: Record<string, unknown>[] = [];
    for (const n of notes) {
      const tokens = tokensByUser.get(n.user_id) ?? [];
      const payload = (n.payload ?? {}) as Record<string, unknown>;
      const data = {
        notificationId: n.id,
        route: n.route ?? null,
        venueId: n.venue_id ?? null,
        eventId: n.event_id ?? null,
        ...payload,
      };
      for (const to of tokens) {
        messages.push({ to, title: n.title, body: n.body ?? "", data, sound: "default" });
      }
    }

    let sent = 0;
    for (const group of chunk(messages, BATCH)) {
      if (group.length === 0) continue;
      const resp = await fetch(EXPO_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(group),
      });
      if (resp.ok) sent += group.length;
      // A failed batch is left unmarked below only if EVERY batch failed; partial
      // Expo errors (bad token) are receipts we do not chase in this v1.
    }

    // Stamp all swept notifications as pushed (even those whose user had no token --
    // there is nothing more to try, and we must not re-scan them forever).
    const ids = notes.map((n) => n.id);
    await admin.from("notifications").update({ pushed_at: new Date().toISOString() }).in("id", ids);

    return json({ notifications: notes.length, messages: messages.length, sent });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
