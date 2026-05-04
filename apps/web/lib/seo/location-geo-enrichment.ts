/**
 * Named landmarks & micro-areas for entity-rich copy (extends structured JSON without bloating every hub row).
 * Expand gradually as you publish deeper suburb guides.
 */
export type LocationGeoHints = {
  readonly landmarks: readonly string[];
  readonly microAreas: readonly string[];
  /** Major roads / corridors — strengthens local entity signals alongside landmarks. */
  readonly roads?: readonly string[];
  /** Typical housing mix — unique per suburb to reduce templated footprint. */
  readonly propertyTypeDensity?: string;
  readonly parkingNotes?: string;
  readonly accessNotes?: string;
};

const DATA: Record<string, LocationGeoHints> = {
  "sea-point-cleaning-services": {
    landmarks: ["Main Road strip", "Sea Point Promenade", "Milton Pool lawns"],
    microAreas: ["Three Anchor Bay", "High Level Road corridor", "Queens Beach walkshed"],
    roads: ["Main Road", "Regent Road", "Victoria Road"],
    propertyTypeDensity: "High apartment and sectional-title density along the Atlantic Seaboard strip.",
    parkingNotes: "Visitor bays fill quickly on Main Road—note loading zones or basement instructions when you book.",
    accessNotes:
      "Many crews stage along Regent or side roads and walk the last stretch when bays are tight—pin your intercom and lift route clearly.",
  },
  "green-point-cleaning-services": {
    landmarks: ["Green Point Urban Park", "V&A Waterfront edge"],
    microAreas: ["Somerset Road", "Chiappini Street quarter"],
    roads: ["Somerset Road", "Main Road (Green Point)", "Bill Peters Drive"],
    propertyTypeDensity: "Dense modern apartments around Somerset Road with pockets of older houses toward Sea Point.",
    parkingNotes:
      "Event nights near the stadium squeeze street parking—morning slots often route cleaner than peak evenings.",
    accessNotes:
      "Waterfront-adjacent blocks sometimes use separate service entrances; mention boom gates and remotes in booking notes.",
  },
  "claremont-cleaning-services": {
    landmarks: ["Claremont CBD", "Arderne Gardens vicinity"],
    microAreas: ["Harfield Village", "Newlands-adjacent pockets"],
    roads: ["Main Road", "Belmont Road", "Klipfontein Road"],
    propertyTypeDensity: "Mix of Victorian cottages, townhouses, and newer apartments clustered near the CBD and schools.",
    parkingNotes: "Mall-side roads and Main Road service bays back up at lunch—specify rear lanes or visitor stickers if you have them.",
    accessNotes:
      "Harfield Village’s narrower streets favour shorter parking windows; crews appreciate exact gate or garage directions.",
  },
  "rondebosch-cleaning-services": {
    landmarks: ["Main Road Rondebosch", "UCT-adjacent pockets"],
    microAreas: ["Groote Schuur Hospital vicinity", "Mowbray border"],
    roads: ["Main Road", "Campground Road", "Liesbeeck Parkway"],
    propertyTypeDensity: "Blend of student flats, family houses, and hospital-adjacent apartments along Main Road.",
    parkingNotes: "Hospital shift changes congest Campground approaches—buffer 15 minutes if your street feeds those corridors.",
    accessNotes:
      "Split-level homes and shared drives are common—note which entrance cleaners should use if your erf has two street fronts.",
  },
  "gardens-cleaning-services": {
    landmarks: ["Kloof Street corridor", "Company’s Garden fringe"],
    microAreas: ["Upper Gardens", "Oranjezicht walkshed"],
    roads: ["Kloof Street", "Mill Street", "Buitenkant Street"],
    propertyTypeDensity:
      "Dense heritage flats and walk-ups with pockets of townhouses—fewer freestanding plots than the Southern Suburbs.",
    parkingNotes:
      "On-street discs and tight visitor rotations dominate—morning slots often beat evening circling near Kloof.",
    accessNotes:
      "Staircases and split-level conversions are common; specify which buzzer, stairwell, or rear entrance cleaners should use.",
  },
  "durbanville-cleaning-services": {
    landmarks: ["Durbanville CBD", "Wine-route gateway"],
    microAreas: ["Durbanville Hills", "Sonstraal corridor"],
    roads: ["Main Road", "Bright Street", "Jan Beyers Avenue"],
    propertyTypeDensity: "Freestanding houses and townhouses dominate with newer estates toward the hills.",
    parkingNotes: "Estate visitor bays vary—note boom codes and whether cleaners should use a service gate.",
    accessNotes: "Larger plots mean longer indoor walks; pin the kitchen entrance if your garage route is fastest.",
  },
  "observatory-cleaning-services": {
    landmarks: ["Lower Main Road Observatory", "Groote Schuur fringe"],
    microAreas: ["Station surrounds", "Woodstock border"],
    roads: ["Lower Main Road", "Salt River Road", "Anzio Road"],
    propertyTypeDensity: "Student shares, duplex flats, and compact apartments cluster along Main Road corridors.",
    parkingNotes: "Street bays turn over fast near cafes—loading zones work better for short cleaner arrivals when available.",
    accessNotes: "Shared gates and digicode blocks are typical—drop remotes or staircase letters to avoid stalled starts.",
  },
  "newlands-cleaning-services": {
    landmarks: ["Newlands Village", "Newlands Forest edge"],
    microAreas: ["Bishopscourt border pockets", "Claremont-adjacent lanes"],
    roads: ["Kildare Road", "Newlands Avenue", "Campground Road"],
    propertyTypeDensity: "Tree-heavy streets with family houses, cottages, and select sectional schemes—not high-rise dense.",
    parkingNotes: "Canopy-lined roads narrow visibility—note which side of the street has safer stopping if bays are informal.",
    accessNotes: "Split-level houses and side entrances are routine; say whether crews should use kitchen or front doors.",
  },
  "constantia-cleaning-services": {
    landmarks: ["Constantia wine valley", "Tokai greenbelt", "Groot Constantia"],
    microAreas: ["Buitenverwachting strip", "Silverhurst pockets", "High Constantia ridge"],
    roads: ["Constantia Main Road", "Price Drive", "Alphen Drive"],
    propertyTypeDensity:
      "Large plots, estate-style drives, and entertainment-heavy kitchens — fewer high-rise blocks than the Seaboard.",
    parkingNotes: "Longer drives and gatehouses are common—note visitor protocols and whether crews should use a service entrance.",
    accessNotes:
      "Multi-wing homes benefit from a “start in kitchen” pin and alarm notes; outdoor-adjacent dust tracks in after windy weeks.",
  },
  "wynberg-cleaning-services": {
    landmarks: ["Maynardville Park", "Wynberg village strip", "Alphen Trail fringe"],
    microAreas: ["Upper Wynberg", "Broad Road corridor", "Kenilworth border pockets"],
    roads: ["Broad Road", "Ottery Road", "Waterloo Green"],
    propertyTypeDensity: "Character cottages, townhouses, and established gardens — mix of older floors and pet-friendly homes.",
    parkingNotes: "School-run peaks tighten bays near village retail—morning slots often route cleaner than late afternoon.",
    accessNotes: "Side gates and split levels are typical—say which entrance crews should use if your erf has two fronts.",
  },
  "camps-bay-cleaning-services": {
    landmarks: ["Camps Bay Beach", "Twelve Apostles backdrop", "Victoria Road strip"],
    microAreas: ["Beta Road climbs", "Theresa Avenue villas", "Glen Beach walkshed"],
    roads: ["Victoria Road", "Kloof Road", "Theresa Avenue"],
    propertyTypeDensity: "Beach-adjacent apartments, villas, and short-stay stock — sand and salt air shape realistic mop time.",
    parkingNotes: "Peak-season bays vanish fast on Victoria Road—loading zones and precise pins prevent circling delays.",
    accessNotes: "Stepped access and hillside drives are common; mention intercoms, remotes, and whether crews should use rear doors.",
  },
};

export function getLocationGeoHints(slug: string): LocationGeoHints | null {
  return DATA[slug] ?? null;
}
