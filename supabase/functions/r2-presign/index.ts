import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

// Allowed image types -> file extension. The server, not the client,
// decides the extension, so a caption can't smuggle an arbitrary path.
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const EXPIRY_SECONDS = 300; // ~5 minutes

// Abuse caps for ordinary signed-in users. Admins bypass both: bulk listing/harvest work
// legitimately signs far more than a person posting moments ever would.
const MAX_BYTES = 12 * 1024 * 1024; // a full-size phone photo; the client compresses well under this
const RATE_LIMIT = 40;              // presigns per user...
const RATE_WINDOW_MS = 60 * 60 * 1000; // ...per hour

// --- AWS SigV4 helpers (Web Crypto) ---
const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(msg: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(msg)));
}

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
}

// RFC3986 encoding (encodeURIComponent leaves !*'() unencoded).
function uriEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

async function presignPutUrl(opts: {
  accountId: string;
  bucket: string;
  key: string;
  contentType: string;
  accessKey: string;
  secretKey: string;
}): Promise<string> {
  const { accountId, bucket, key, contentType, accessKey, secretKey } = opts;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Path-style: /{bucket}/{key}. Encode each segment, keep slashes.
  const canonicalUri =
    "/" + uriEncode(bucket) + "/" + key.split("/").map(uriEncode).join("/");

  const signedHeaders = "content-type;host";

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(EXPIRY_SECONDS),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuerystring = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(enc.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { contentType, contentLength } = await req.json().catch(() => ({}));
    if (!contentType || typeof contentType !== "string" || !EXT[contentType]) {
      return json({ error: "contentType must be a supported image type." }, 400);
    }
    // Advisory only: the signature covers content-type and host, not length, so a hostile
    // client can under-declare. It stops an honest client wasting a slow link on a photo we
    // would reject anyway; the rate limit below is what actually bounds abuse.
    if (typeof contentLength === "number" && contentLength > MAX_BYTES) {
      return json({ error: "That photo is too large. Please pick a smaller one." }, 413);
    }

    // Auth gate — anyone signed in may upload (moments, review photos). Non-admins are
    // rate-limited; admins are not, since bulk listing work signs many more than a person does.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not authenticated." }, 401);
    const { data: isAdmin } = await supabase.rpc("is_admin");

    // Service role: the ledger is closed to clients, so counting and writing happen here.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (!isAdmin) {
      const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
      const { count, error: countErr } = await admin
        .from("upload_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since);
      // Fail closed: if the ledger can't be read we can't prove the user is under quota.
      if (countErr) return json({ error: "Could not verify upload quota." }, 503);
      if ((count ?? 0) >= RATE_LIMIT) {
        return json({ error: "Too many uploads in the last hour. Please try again later." }, 429);
      }
    }

    const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
    const bucket = Deno.env.get("R2_BUCKET_NAME")!;
    const accessKey = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const secretKey = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const publicBase = Deno.env.get("R2_PUBLIC_BASE_URL")!.replace(/\/+$/, "");

    // Server generates the key. The client never names the path.
    const key = `listings/${crypto.randomUUID()}.${EXT[contentType]}`;

    const uploadUrl = await presignPutUrl({
      accountId,
      bucket,
      key,
      contentType,
      accessKey,
      secretKey,
    });

    // publicUrl is the permanent read URL — distinct from the signed uploadUrl.
    const publicUrl = `${publicBase}/${key}`;

    // Spend the quota on the signature, not on the upload finishing: a signed URL is the
    // thing that can be used, whether or not this client follows through with the PUT.
    await admin.from("upload_events").insert({
      user_id: user.id,
      content_type: contentType,
      bytes: typeof contentLength === "number" ? contentLength : null,
    });

    return json({ uploadUrl, publicUrl, key }, 200);
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
