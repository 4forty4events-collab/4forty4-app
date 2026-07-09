// Custom dark map style for Google Maps (react-native-maps `customMapStyle`).
// Tuned to the app's cinematic dark palette: near-black land, muted labels, dim
// roads, deep water — so our category-colored pins are the brightest thing on the
// map. Only applies with provider={PROVIDER_GOOGLE}.
export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0e0f12' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8b8f98' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0e0f12' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2d33' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9aa0aa' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#b7bcc5' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#14261c' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1b1d22' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b7078' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#22252b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c3038' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1a24' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d5a6b' }] },
];
