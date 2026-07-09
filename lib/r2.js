import { supabase } from './supabase';

// Presign -> PUT bytes to R2 -> return the permanent public URL we own. Shared by
// the review form's cover/gallery pickers and the flyer-OCR picker (IG/CDN URLs
// expire, so anything we keep as a cover must be re-hosted here first).
export async function uploadBlobToR2(blob, contentType) {
  const { data: signed, error: signErr } = await supabase.functions.invoke('r2-presign', {
    body: { contentType },
  });
  if (signErr || !signed?.uploadUrl) {
    throw new Error(signErr?.message ?? 'Could not get an upload URL.');
  }
  const putResp = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putResp.ok) throw new Error(`Upload failed (${putResp.status}).`);
  return signed.publicUrl;
}
