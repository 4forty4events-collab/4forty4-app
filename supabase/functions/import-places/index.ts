import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Venue ingestion from Google Places API (NEW) v1 ────────────────────────────
// Admin-only. Pulls venues (restaurants, cafés, hotels, places) so we don't seed
// them by hand. Events stay on the Instagram→AI pipeline. Cost discipline:
//  • every Google call sends a tight X-Goog-FieldMask (extra fields bill higher).
//  • each photo is fetched ONCE here and pushed to our own R2; we store the R2
//    URL, never hot-link Google's photo for feed rendering.
//  • only NEW venues (not already in our DB by google_place_id) get a photo
//    fetched — a re-import of an area costs nothing for venues we already have.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The Google Places key is application-restricted to our iOS app. This function runs
// server-side, so every Google call must carry the app's bundle id to pass that check
// (Google validates iOS keys purely by this header). Keep it in sync with app.json.
const IOS_BUNDLE_ID = "com.fourforty4events.app";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

const MARKET: Record<string, { regionCode: string; country: string; currency: string }> = {
  DZ: { regionCode: "DZ", country: "Algeria", currency: "DZD" },
  ZW: { regionCode: "ZW", country: "Zimbabwe", currency: "USD" },
};

// Google place type → our category enum. First match in a place's types[] wins.
const TYPE_TO_CATEGORY: Record<string, string> = {
  restaurant: "restaurant", food: "restaurant", meal_takeaway: "restaurant",
  meal_delivery: "restaurant", bakery: "cafe", cafe: "cafe", coffee_shop: "cafe",
  bar: "nightlife", night_club: "nightlife", lodging: "hotel", hotel: "hotel",
  resort_hotel: "hotel", tourist_attraction: "tourism", museum: "culture",
  art_gallery: "culture", park: "outdoor", campground: "outdoor",
  national_park: "outdoor", hiking_area: "outdoor", shopping_mall: "shopping",
  store: "shopping", clothing_store: "shopping", gym: "wellness", spa: "wellness",
  stadium: "sports", sports_complex: "sports",
};

function mapCategory(types: string[] | undefined): string {
  for (const t of types ?? []) {
    if (TYPE_TO_CATEGORY[t]) return TYPE_TO_CATEGORY[t];
  }
  return "other";
}

// Google priceLevel (New API string enum) → per-person estimate + 0–4 smallint.
// Tune these to real local prices. price_estimated=true is set whenever we use one.
const PRICE_BY_MARKET: Record<string, Record<string, number>> = {
  DZD: {
    PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 400, PRICE_LEVEL_MODERATE: 1200,
    PRICE_LEVEL_EXPENSIVE: 2500, PRICE_LEVEL_VERY_EXPENSIVE: 5000,
  },
  USD: {
    PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 5, PRICE_LEVEL_MODERATE: 15,
    PRICE_LEVEL_EXPENSIVE: 35, PRICE_LEVEL_VERY_EXPENSIVE: 70,
  },
};
const PRICE_LEVEL_SMALLINT: Record<string, number> = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// ── R2 upload (AWS SigV4, Web Crypto) — mirrors r2-presign, but the function
// itself fetches the photo bytes and PUTs them, server-side. ───────────────────
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (msg: string) =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(msg)));
async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}
const uriEncode = (s: string) =>
  encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
};

async function presignPutUrl(opts: {
  accountId: string; bucket: string; key: string; contentType: string;
  accessKey: string; secretKey: string;
}): Promise<string> {
  const { accountId, bucket, key, contentType, accessKey, secretKey } = opts;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto", service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = "/" + uriEncode(bucket) + "/" + key.split("/").map(uriEncode).join("/");
  const signedHeaders = "content-type;host";
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQs = Object.keys(query).sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`).join("&");
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = ["PUT", canonicalUri, canonicalQs, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const kDate = await hmac(enc.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  return `https://${host}${canonicalUri}?${canonicalQs}&X-Amz-Signature=${signature}`;
}

// Fetch a Google photo by its resource name, push to R2, return the public URL.
// Returns null on any failure — a missing photo must not abort the whole import.
async function importPhoto(photoName: string, apiKey: string, r2: {
  accountId: string; bucket: string; accessKey: string; secretKey: string; publicBase: string;
}): Promise<string | null> {
  try {
    // maxWidthPx caps the billed resolution; fetch follows the redirect to the bytes.
    const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1080&key=${apiKey}`;
    const resp = await fetch(mediaUrl, { headers: { "X-Ios-Bundle-Identifier": IOS_BUNDLE_ID } });
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    const ext = EXT[ct] ?? "jpg";
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength === 0) return null;

    const key = `listings/google/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = await presignPutUrl({
      accountId: r2.accountId, bucket: r2.bucket, key,
      contentType: ct, accessKey: r2.accessKey, secretKey: r2.secretKey,
    });
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": ct }, body: bytes });
    if (!put.ok) return null;
    return `${r2.publicBase}/${key}`;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { market, city, category, query } = await req.json().catch(() => ({}));
    if (!MARKET[market]) return json({ error: "market must be 'DZ' or 'ZW'." }, 400);
    if (!city || typeof city !== "string") return json({ error: "city is required." }, 400);

    // Auth gate — admin only, same as parse-listing / r2-presign.
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Not authenticated." }, 401);
    const { data: isAdmin } = await authed.rpc("is_admin");
    if (!isAdmin) return json({ error: "Admin only." }, 403);

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return json({ error: "GOOGLE_PLACES_API_KEY not configured." }, 500);

    const { regionCode, country, currency } = MARKET[market];
    const textQuery = (typeof query === "string" && query.trim())
      ? query.trim()
      : `${category ?? "places"} in ${city}, ${country}`;

    // Places API (NEW) Text Search. Tight FieldMask — request ONLY what we map.
    const searchResp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Ios-Bundle-Identifier": IOS_BUNDLE_ID,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.priceLevel,places.photos",
      },
      body: JSON.stringify({ textQuery, regionCode, languageCode: "en" }),
    });
    if (!searchResp.ok) {
      return json({ error: "places_search_failed", detail: await searchResp.text() }, 502);
    }
    const searchData = await searchResp.json();
    const places: any[] = searchData.places ?? [];
    if (places.length === 0) {
      return json({ ok: true, imported: 0, existed: 0, total: 0, message: "No places found for that query." }, 200);
    }

    // Service-role client for the upsert (admin already verified; bypasses RLS).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Which of these do we already have? Skip them entirely — no photo re-fetch.
    const ids = places.map((p) => p.id).filter(Boolean);
    const { data: existing } = await admin
      .from("venues").select("google_place_id").in("google_place_id", ids);
    const existingSet = new Set((existing ?? []).map((r) => r.google_place_id));

    const priceMap = PRICE_BY_MARKET[currency];
    const rows: Record<string, unknown>[] = [];

    for (const p of places) {
      if (!p.id || existingSet.has(p.id)) continue;

      const level: string | undefined = p.priceLevel;
      const hasPrice = !!level && level in priceMap;

      let coverImageUrl: string | null = null;
      const photoName = p.photos?.[0]?.name;
      if (photoName) {
        coverImageUrl = await importPhoto(photoName, apiKey, {
          accountId: Deno.env.get("R2_ACCOUNT_ID")!,
          bucket: Deno.env.get("R2_BUCKET_NAME")!,
          accessKey: Deno.env.get("R2_ACCESS_KEY_ID")!,
          secretKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
          publicBase: Deno.env.get("R2_PUBLIC_BASE_URL")!.replace(/\/+$/, ""),
        });
      }

      rows.push({
        google_place_id: p.id,
        source: "google",
        name: p.displayName?.text ?? "Unnamed place",
        address: p.formattedAddress ?? null,
        latitude: p.location?.latitude ?? null,
        longitude: p.location?.longitude ?? null,
        category: mapCategory(p.types),
        market,
        city,
        cover_image_url: coverImageUrl,
        is_stub: false,
        duration_days: 1,
        price_per_person: hasPrice ? priceMap[level!] : null,
        price_type: hasPrice ? "per_person" : null,
        price_estimated: hasPrice,
        price_level: hasPrice ? PRICE_LEVEL_SMALLINT[level!] : null,
      });
    }

    let imported = 0;
    if (rows.length > 0) {
      // ignoreDuplicates: a race where the same place arrived twice won't error,
      // and any venue an admin later curated is never clobbered.
      const { data: inserted, error } = await admin
        .from("venues")
        .upsert(rows, { onConflict: "google_place_id", ignoreDuplicates: true })
        .select("id");
      if (error) return json({ error: "upsert_failed", detail: error.message }, 500);
      imported = inserted?.length ?? 0;
    }

    return json({
      ok: true,
      total: places.length,
      imported,
      existed: existingSet.size,
      message: `Imported ${imported} venue${imported === 1 ? "" : "s"}` +
        (existingSet.size ? `, ${existingSet.size} already existed.` : "."),
    }, 200);
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
