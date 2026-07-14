import { supabase } from './supabase';

const SIGN_MS = 15000; // presign is a small JSON round-trip; slow past this = a dead connection
const PUT_MS = 45000;  // the bytes themselves, which may be on a weak mobile link
const BLOB_MS = 20000; // local file -> bytes; only slow when a photo skipped compression

// Reject with a clear, retryable message rather than hanging. Every network-ish step in the
// upload path goes through this: an unbounded await here shows up to the user as a spinner
// that never resolves, with nothing to retry.
function withTimeout(promise, ms, message) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

// Read a local (file://) uri into bytes. Pulled out so callers get the same guard + timing
// as the rest of the path — this step is cheap for a compressed photo but expensive for a
// full-size one, so its timing tells us whether compression actually ran.
export async function blobFromUri(uri) {
  const t = Date.now();
  const blob = await withTimeout(
    fetch(uri).then((r) => r.blob()),
    BLOB_MS,
    'Could not read that photo — try picking it again.',
  );
  console.log(`[upload] read ${Math.round(blob.size / 1024)}KB in ${Date.now() - t}ms`);
  return blob;
}

// functions.invoke flattens any non-2xx into "Edge Function returned a non-2xx status code",
// burying the reason. The real message ("too large", "too many uploads in the last hour") is
// in the response body, and it's the only part worth showing a user.
async function presignError(err) {
  try {
    const body = await err?.context?.json?.();
    if (body?.error) return body.error;
  } catch { /* not a JSON body — fall through to the generic message */ }
  return err?.message ?? 'Could not get an upload URL.';
}

// Presign -> PUT bytes to R2 -> return the permanent public URL we own. Shared by
// the review form's cover/gallery pickers and the flyer-OCR picker (IG/CDN URLs
// expire, so anything we keep as a cover must be re-hosted here first).
export async function uploadBlobToR2(blob, contentType) {
  const t0 = Date.now();
  const { data: signed, error: signErr } = await withTimeout(
    // contentLength lets the server reject an oversize photo before we spend a slow
    // connection uploading it.
    supabase.functions.invoke('r2-presign', { body: { contentType, contentLength: blob.size } }),
    SIGN_MS,
    'Could not reach the upload service — check your connection and try again.',
  );
  if (signErr || !signed?.uploadUrl) {
    throw new Error(await presignError(signErr));
  }
  console.log(`[upload] presign ${Date.now() - t0}ms`);

  // Guard against a stuck upload: abort so the caller gets a clear, retryable error
  // instead of a spinner that never resolves.
  const t1 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PUT_MS);
  let putResp;
  try {
    putResp = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'Upload timed out — check your connection and try again.' : (e?.message ?? 'Upload failed.'));
  } finally {
    clearTimeout(timer);
  }
  if (!putResp.ok) throw new Error(`Upload failed (${putResp.status}).`);
  console.log(`[upload] PUT ${Math.round(blob.size / 1024)}KB in ${Date.now() - t1}ms`);
  return signed.publicUrl;
}
