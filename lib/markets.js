// Country / market catalog. `live` markets have content and are selectable;
// others render as greyed-out "Coming soon" to show the platform's roadmap
// without ever pointing the discovery engine at an empty catalog. City-level
// precision (Algiers vs Oran) is handled by PostGIS radius sorting, not here —
// this axis swaps the whole catalog (the `market` the discover RPC filters on).
export const MARKETS = [
  { code: 'DZ', label: 'Algeria', flag: '🇩🇿', live: true },
  { code: 'ZW', label: 'Zimbabwe', flag: '🇿🇼', live: true },
  { code: 'TN', label: 'Tunisia', flag: '🇹🇳', live: false },
  { code: 'MA', label: 'Morocco', flag: '🇲🇦', live: false },
  { code: 'FR', label: 'France', flag: '🇫🇷', live: false },
];

export const LIVE_MARKETS = MARKETS.filter((m) => m.live);

export function marketLabel(code) {
  return MARKETS.find((m) => m.code === code)?.label ?? code;
}
