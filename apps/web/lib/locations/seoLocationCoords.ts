/**
 * Approximate suburb centres for "nearest area" from browser geolocation.
 * Keys match `BookingLocationRecord.slug` (short slug, no `-cleaning-services`).
 */
export const SEO_LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
  "bantry-bay": { lat: -33.924, lng: 18.379 },
  bergvliet: { lat: -34.045, lng: 18.448 },
  "camps-bay": { lat: -33.95, lng: 18.377 },
  claremont: { lat: -33.978, lng: 18.465 },
  fresnaye: { lat: -33.93, lng: 18.395 },
  gardens: { lat: -33.933, lng: 18.408 },
  "green-point": { lat: -33.905, lng: 18.394 },
  kenilworth: { lat: -34.008, lng: 18.475 },
  newlands: { lat: -33.975, lng: 18.452 },
  observatory: { lat: -33.938, lng: 18.447 },
  plumstead: { lat: -34.021, lng: 18.477 },
  rondebosch: { lat: -33.956, lng: 18.475 },
  rosebank: { lat: -33.955, lng: 18.47 },
  "sea-point": { lat: -33.917, lng: 18.395 },
  tamboerskloof: { lat: -33.925, lng: 18.404 },
  vredehoek: { lat: -33.938, lng: 18.415 },
  woodstock: { lat: -33.927, lng: 18.442 },
  wynberg: { lat: -33.992, lng: 18.465 },
  zonnebloem: { lat: -33.927, lng: 18.425 },
  constantia: { lat: -34.014, lng: 18.424 },
  "table-view": { lat: -33.823, lng: 18.452 },
  durbanville: { lat: -33.828, lng: 18.65 },
  bellville: { lat: -33.902, lng: 18.629 },
};
