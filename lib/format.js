// Display formatting helpers.

// Turn a raw, address-heavy venue name into a clean card title.
// e.g. "Mohammadia rue de Djurdjura Public Garden 36.73,3.16" -> "Mohammadia Public Garden".
// Strips street designations, house numbers, and trailing coordinate blobs, then
// caps length. Falls back to the original if cleanup would leave nothing useful.
export function formatVenueTitle(raw) {
  if (!raw) return raw;
  const original = String(raw).trim();
  let s = original;

  // If the name IS essentially a street/address (starts with a designator), don't
  // gut it to a fragment -- just tidy + cap it.
  if (/^(rue|avenue|ave|route|boulevard|blvd|cité|cite|lotissement|lot|residence|résidence)\b/i.test(original)) {
    s = original.replace(/\s{2,}/g, ' ').trim();
    return s.length > 44 ? s.slice(0, 44).replace(/\s+\S*$/, '').trim() + '…' : s;
  }

  // trailing "lat,long" blobs (comma-separated decimal pair) and anything after
  s = s.replace(/[,\s-]*\b\d{1,3}\.\d{2,}\s*,\s*\d{1,3}\.\d{2,}\b.*$/g, '');
  // house/street numbers like "n 12", "no 12", "n° 12"
  s = s.replace(/\bn[°o]?\.?\s?\d+\b/gi, ' ');
  // street designator + the following street-name token (longest alternatives first)
  s = s.replace(
    /\b(rue de la|rue de|rue du|rue|avenue de|avenue|ave|route nationale|route de|route|boulevard|blvd|lotissement|residence|résidence|cité|cite|lot)\b\.?\s+[A-Za-zÀ-ÿ0-9'’.-]+/gi,
    ' ',
  );

  // collapse whitespace + trim stray punctuation
  s = s.replace(/\s{2,}/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '').trim();
  if (!s || s.length < 3) s = original;

  if (s.length > 44) s = s.slice(0, 44).replace(/\s+\S*$/, '').trim() + '…';
  return s;
}
