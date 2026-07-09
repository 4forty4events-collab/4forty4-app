import { createClient } from "jsr:@supabase/supabase-js@2";

const CATEGORIES = [
  "restaurant","cafe","nightlife","music_event","festival","sports",
  "outdoor","tourism","hotel","shopping","wellness","culture",
  "entertainment","education","meetup","other",
];
const TAGS = [
  "free","budget","upscale","date_spot","family_friendly",
  "group_friendly","hidden_gem","seasonal",
];
const MARKET: Record<string, { tz: string; currency: string; callingCode: string }> = {
  DZ: { tz: "Africa/Algiers", currency: "DZD", callingCode: "213" },
  ZW: { tz: "Africa/Harare",  currency: "USD", callingCode: "263" },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

function todayInTz(tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // -> YYYY-MM-DD
}

function systemPrompt(market: string, today: string, currency: string, callingCode: string) {
  return `You extract structured listing data from a social-media caption for a
real-world discovery app operating in ${market} (DZ = Algeria, ZW = Zimbabwe).

Captions may be in French, Arabic, Algerian Darija, English, Shona, or Ndebele,
often mixed. Understand all of them. Always write the description in English.

Return ONE JSON object and nothing else — no prose, no markdown, no code fences.

Schema:
{
  "target_type": "venue" | "event",
  "title": string,
  "category": one of [${CATEGORIES.join(", ")}],
  "tags": array, zero or more of [${TAGS.join(", ")}],
  "venue_name": string | null,
  "description": string,
  "event_date": "YYYY-MM-DD" | null,
  "event_time": string | null,
  "price": number | null,
  "price_note": string | null,
  "currency": "DZD" | "USD" | null,
  "price_per_person": number | null,
  "price_type": "per_person" | "per_group" | "per_day" | "per_night" | "from" | "free" | null,
  "price_max": number | null,
  "duration_days": integer (>= 1),
  "address": string | null,
  "contact_whatsapp": string | null,
  "contact_phone": string | null,
  "contact_instagram": string | null,
  "flags": array of short strings
}

Rules:
- target_type: "event" if it's a dated/one-off happening; "venue" if it's an ongoing
  place. When unsure, prefer "venue" and add the flag "type_uncertain".
- category: exactly one from the list. If nothing fits, use "other".
- tags: only values from the tag list. Omit any you're unsure of.
- title: the display name. For a venue, the place's name. For an event, the event's
  name; put the place in venue_name.
- description: an original 1–2 sentence summary in neutral English. Do NOT copy the
  caption's wording. Strip hashtags, emojis, @handles, promo filler.
- event_date: resolve relative dates against TODAY = ${today} in the ${market}
  timezone. Output YYYY-MM-DD. If absent or unclear, return null. NEVER invent a date.
- currency: default to ${currency}. Override only if the caption clearly states another.
- price: a clean number only if clearly stated; else null. Put ambiguous pricing
  ("free entry", "from 1000 DA") in price_note. Free or no-cost entry is NOT a
  price of 0 — set price to null, record it in price_note (e.g. "Free entry"),
  and add the "free" tag.
- price_type: classify how the stated price is charged:
  "per_person" (default for an entry/ticket/cover), "per_group" (one total for the
  whole booking/table/car, e.g. "5000 DA la table"), "per_day" or "per_night"
  (lodging/rental/multi-day rate), "from" (a starting/minimum price, "à partir de"),
  or "free". If no price at all, null.
- price_per_person: the NORMALIZED cost for ONE person, used for budget math.
  * per_person: same as price.
  * per_group: divide the group total by the group size if stated (e.g.
    "4000 DA pour 4" -> 1000). If the size is NOT stated, assume 2, set
    price_per_person accordingly, and add the flag "price_uncertain".
  * per_day / per_night: the per-person cost for ONE day/night (still per person).
  * a range ("1000–1500 DA"): set price_per_person to the LOW end and price_max to
    the HIGH end.
  * free or unknown: null.
- price_max: the high end of a price range, else null.
- duration_days: how many days the outing spans. A single day out (meal, concert,
  day trip) = 1. Detect multi-day stays/excursions ("3 jours / 2 nuits",
  "week-end", "2-night package") and set the number of days (a 2-night stay = 3
  days unless the caption says otherwise; "week-end" = 2). Default 1 when unclear.
- address: only if the caption states one; else null.
- Contact details: extract them only when present in the caption.
- Multiple numbers: organizers often list two or more numbers separated by "/",
  ",", "ou", or "or" (e.g. "0542801782 / 0557168013"). Use ONLY THE FIRST valid
  number for contact_phone and contact_whatsapp. NEVER concatenate them into one
  number — a fused number is invalid and un-dialable.
- contact_whatsapp: output DIGITS ONLY in international format — no "+", no spaces,
  no dashes (e.g. "213562196497"). If the caption gives a local number with no
  country code, apply this market's calling code ${callingCode} and drop a leading
  "0": e.g. in ${market}, "0562 19 64 97" -> "${callingCode}562196497". If you
  cannot confidently determine the full international number, return null and add
  the flag "contact_uncertain". The same number may be both a call line and a
  WhatsApp number — if so, populate both contact_phone and contact_whatsapp.
- contact_phone: the human-readable number for dialing; local formatting is fine.
- contact_instagram: the handle ONLY — strip a leading "@" and any
  "instagram.com/" URL prefix (e.g. "@boutribicha" -> "boutribicha").
- Return null for any field you cannot determine. A null the human fills in beats a
  guess that reaches a user.
- flags: short reviewer notes, e.g. "date_uncertain", "price_missing",
  "venue_uncertain", "type_uncertain", "language_mixed".`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { text, market } = await req.json().catch(() => ({}));
    if (!text || typeof text !== "string") return json({ error: "Missing 'text'." }, 400);
    if (!MARKET[market]) return json({ error: "market must be 'DZ' or 'ZW'." }, 400);

    // Auth gate — caller must be an admin
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not authenticated." }, 401);
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) return json({ error: "Admin only." }, 403);

    const { tz, currency, callingCode } = MARKET[market];
    const today = todayInTz(tz);

    // Call OpenRouter (Claude via OpenRouter's chat-completions API)
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
          { role: "system", content: systemPrompt(market, today, currency, callingCode) },
          { role: "user", content: text },
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
      return json({ error: "parse_failed", raw_caption: text, model_output: raw }, 200);
    }

    return json({ ok: true, market, today, parsed }, 200);
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
