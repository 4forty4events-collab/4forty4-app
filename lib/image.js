import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Max edge (px) we keep for uploaded photos. Gallery/cover renders never need more,
// and this turns multi-MB phone captures into ~100-300KB JPEGs — fast upload, fast render.
const MAX_EDGE = 1200;
const QUALITY = 0.75;

// Downscale + JPEG-compress a locally-picked image before it goes to R2. Takes the
// picker asset's uri (+ optional width/height so we can resize the *longer* edge and
// preserve aspect ratio without upscaling small photos). Returns a new local file uri
// pointing at the optimized JPEG. On any failure we fall back to the original uri so a
// manipulator hiccup never blocks the upload.
export async function compressForUpload(uri, width, height) {
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
    return result.uri;
  } catch {
    return uri;
  }
}
