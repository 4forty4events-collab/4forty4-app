import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Max edge (px) we keep for uploaded photos. Gallery/cover renders never need more,
// and this turns multi-MB phone captures into ~100-300KB JPEGs — fast upload, fast render.
const MAX_EDGE = 1000;
const QUALITY = 0.68;

// Avatars are standardized: a fixed square edge + firmer compression, so every
// stored profile picture is a small, uniform file that loads fast in feed lists
// and sits cleanly in the app's circular avatar frames.
const AVATAR_EDGE = 512;
const AVATAR_QUALITY = 0.72;

// Normalize an avatar to AVATAR_EDGE x AVATAR_EDGE and JPEG-compress it. Callers
// pass an ALREADY square-cropped uri (the picker crops 1:1), so forcing both
// dimensions standardizes the size without distorting. Falls back to the original
// uri on any manipulator failure so a hiccup never blocks the upload.
export async function compressAvatar(uri) {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: AVATAR_EDGE, height: AVATAR_EDGE });
    const ref = await ctx.renderAsync();
    const result = await ref.saveAsync({ compress: AVATAR_QUALITY, format: SaveFormat.JPEG });
    return result.uri;
  } catch (e) {
    console.warn('[avatar] compress failed, sending the original image:', e?.message ?? e);
    return uri;
  }
}

// Downscale + JPEG-compress a locally-picked image before it goes to R2. Takes the
// picker asset's uri (+ optional width/height so we can resize the *longer* edge and
// preserve aspect ratio without upscaling small photos). Returns a new local file uri
// pointing at the optimized JPEG. On any failure we fall back to the original uri so a
// manipulator hiccup never blocks the upload.
export async function compressForUpload(uri, width, height) {
  const started = Date.now();
  try {
    const ctx = ImageManipulator.manipulate(uri);
    // Only resize when a dimension is known and actually exceeds the cap; resize the
    // longer edge so the other is computed to keep the ratio. Portrait -> height, else width.
    if (width && height && Math.max(width, height) > MAX_EDGE) {
      ctx.resize(height > width ? { height: MAX_EDGE } : { width: MAX_EDGE });
    } else if (!width || !height) {
      // Dimensions unknown — cap the width defensively (ratio preserved automatically).
      ctx.resize({ width: MAX_EDGE });
    }
    const ref = await ctx.renderAsync();
    const result = await ref.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
    console.log(`[upload] compress ${width}x${height} in ${Date.now() - started}ms`);
    return result.uri;
  } catch (e) {
    // Falling back to the original means uploading a full-size phone photo (several MB),
    // which reads as "the upload just hangs". Say so rather than failing silently.
    console.warn('[upload] compress failed, sending the original full-size photo:', e?.message ?? e);
    return uri;
  }
}
