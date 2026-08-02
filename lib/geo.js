// Shared distance helpers. The Outing Architect has had a private haversine since the
// planner shipped; the feed now needs the same maths to answer "how far is this from
// me?", so it lives here rather than being copied.
//
// Distance is computed CLIENT-SIDE from the viewer's own coordinates and the venue's
// public lat/lng. The viewer's position never leaves the device for this — nothing is
// sent anywhere to render "400 m away".

export function haversineM(origin, target) {
  const lat2 = target?.lat ?? target?.latitude;
  const lng2 = target?.lng ?? target?.longitude;
  if (origin?.lat == null || origin?.lng == null || lat2 == null || lng2 == null) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - origin.lat);
  const dLng = toRad(lng2 - origin.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(origin.lat)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Human distance. Deliberately coarse past a kilometre: "1.2 km" is useful, "1,247 m"
// is false precision on a straight-line estimate that ignores every street.
export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 100) return 'right here';
  if (meters < 1000) return `${Math.round(meters / 50) * 50} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

// Walking time at a slow-city 4.5 km/h, only offered when walking is plausible.
export function walkMinutes(meters) {
  if (meters == null || meters > 2500) return null;
  return Math.max(1, Math.round(meters / 75));
}
