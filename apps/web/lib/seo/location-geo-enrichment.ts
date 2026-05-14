/**
 * Named landmarks & micro-areas for entity-rich copy (extends structured JSON without bloating every hub row).
 * Operational focus: access, parking, housing mix — not tourism copy.
 */
export type LocationGeoHints = {
  readonly landmarks: readonly string[];
  readonly microAreas: readonly string[];
  readonly roads?: readonly string[];
  readonly estates?: readonly string[];
  readonly apartmentZones?: readonly string[];
  /** MyCiTi, arterials, peak pinch-points — one operational line */
  readonly transportAccess?: string;
  readonly propertyTypeDensity?: string;
  readonly parkingNotes?: string;
  readonly accessNotes?: string;
};

const DATA: Record<string, LocationGeoHints> = {
  "sea-point-cleaning-services": {
    landmarks: ["Main Road strip", "Sea Point Promenade", "Milton Pool lawns"],
    microAreas: ["Three Anchor Bay", "High Level Road corridor", "Queens Beach walkshed"],
    roads: ["Main Road", "Regent Road", "Victoria Road"],
    apartmentZones: ["Main Road sectional-title blocks", "Beach Road frontage"],
    transportAccess: "MyCiTi and Main Road buses are dense—morning slots often beat late commuter peaks for kerbside stops.",
    propertyTypeDensity: "High apartment and sectional-title density along the Atlantic Seaboard strip.",
    parkingNotes: "Visitor bays fill quickly on Main Road—note loading zones or basement instructions when you book.",
    accessNotes:
      "Many crews stage along Regent or side roads and walk the last stretch when bays are tight—pin your intercom and lift route clearly.",
  },
  "green-point-cleaning-services": {
    landmarks: ["Green Point Urban Park", "V&A Waterfront edge"],
    microAreas: ["Somerset Road", "Chiappini Street quarter"],
    roads: ["Somerset Road", "Main Road (Green Point)", "Bill Peters Drive"],
    apartmentZones: ["Somerset Road mid-rise belt", "Waterfront-adjacent towers"],
    transportAccess: "Event nights near the stadium change parking—say if a morning clean avoids load-in chaos.",
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
    apartmentZones: ["Main Road student-adjacent flats", "CBD office-adjacent sectional"],
    transportAccess: "School-run peaks on Main Road and Belmont—buffer arrivals if your street feeds those corridors.",
    propertyTypeDensity: "Mix of Victorian cottages, townhouses, and newer apartments clustered near the CBD and schools.",
    parkingNotes: "Mall-side roads and Main Road service bays back up at lunch—specify rear lanes or visitor stickers if you have them.",
    accessNotes:
      "Harfield Village’s narrower streets favour shorter parking windows; crews appreciate exact gate or garage directions.",
  },
  "rondebosch-cleaning-services": {
    landmarks: ["Main Road Rondebosch", "UCT-adjacent pockets"],
    microAreas: ["Groote Schuur Hospital vicinity", "Mowbray border"],
    roads: ["Main Road", "Campground Road", "Liesbeeck Parkway"],
    apartmentZones: ["Lower Main Road flats", "Hospital-adjacent sectional"],
    transportAccess: "Hospital shift changes and UCT term traffic affect Campground and Main—pin side-street parking if you have it.",
    propertyTypeDensity: "Blend of student flats, family houses, and hospital-adjacent apartments along Main Road.",
    parkingNotes: "Hospital shift changes congest Campground approaches—buffer 15 minutes if your street feeds those corridors.",
    accessNotes:
      "Split-level homes and shared drives are common—note which entrance cleaners should use if your erf has two street fronts.",
  },
  "gardens-cleaning-services": {
    landmarks: ["Kloof Street corridor", "Company’s Garden fringe"],
    microAreas: ["Upper Gardens", "Oranjezicht walkshed"],
    roads: ["Kloof Street", "Mill Street", "Buitenkant Street"],
    apartmentZones: ["Kloof heritage walk-ups", "Mill Street compact blocks"],
    transportAccess: "CBD-bound buses and discs on Kloof—morning bays often easier than late-evening circling.",
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
    estates: ["Durbanville Hills estate belt", "Sonstraal security estates"],
    transportAccess: "Jan Beyers and Main feed northern arterials—note estate boom codes so crews do not queue at the wrong gate.",
    propertyTypeDensity: "Freestanding houses and townhouses dominate with newer estates toward the hills.",
    parkingNotes: "Estate visitor bays vary—note boom codes and whether cleaners should use a service gate.",
    accessNotes: "Larger plots mean longer indoor walks; pin the kitchen entrance if your garage route is fastest.",
  },
  "observatory-cleaning-services": {
    landmarks: ["Lower Main Road Observatory", "Groote Schuur fringe"],
    microAreas: ["Station surrounds", "Woodstock border"],
    roads: ["Lower Main Road", "Salt River Road", "Anzio Road"],
    apartmentZones: ["Lower Main student flats", "Station-side duplex stock"],
    transportAccess: "Station foot traffic and Main Road buses—loading zones beat informal double-parking when bays turn over fast.",
    propertyTypeDensity: "Student shares, duplex flats, and compact apartments cluster along Main Road corridors.",
    parkingNotes: "Street bays turn over fast near cafes—loading zones work better for short cleaner arrivals when available.",
    accessNotes: "Shared gates and digicode blocks are typical—drop remotes or staircase letters to avoid stalled starts.",
  },
  "newlands-cleaning-services": {
    landmarks: ["Newlands Village", "Newlands Forest edge"],
    microAreas: ["Bishopscourt border pockets", "Claremont-adjacent lanes"],
    roads: ["Kildare Road", "Newlands Avenue", "Campground Road"],
    estates: ["Pockets of small security clusters toward Constantia ridge"],
    transportAccess: "Campground feeds hospital and school traffic—say if a side street avoids the main pinch point.",
    propertyTypeDensity: "Tree-heavy streets with family houses, cottages, and select sectional schemes—not high-rise dense.",
    parkingNotes: "Canopy-lined roads narrow visibility—note which side of the street has safer stopping if bays are informal.",
    accessNotes: "Split-level houses and side entrances are routine; say whether crews should use kitchen or front doors.",
  },
  "constantia-cleaning-services": {
    landmarks: ["Constantia wine valley", "Tokai greenbelt", "Groot Constantia"],
    microAreas: ["Buitenverwachting strip", "Silverhurst pockets", "High Constantia ridge"],
    roads: ["Constantia Main Road", "Price Drive", "Alphen Drive"],
    estates: ["Silverhurst", "Buitenverwachting-adjacent gated clusters"],
    transportAccess: "Wine-route curves and estate booms—name service gate vs visitor gate to avoid wrong-side waits.",
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
    apartmentZones: ["Village-adjacent flats", "Ottery Road townhouse rows"],
    transportAccess: "School-run peaks near village retail—morning slots often beat late-afternoon bay competition.",
    propertyTypeDensity: "Character cottages, townhouses, and established gardens — mix of older floors and pet-friendly homes.",
    parkingNotes: "School-run peaks tighten bays near village retail—morning slots often route cleaner than late afternoon.",
    accessNotes: "Side gates and split levels are typical—say which entrance crews should use if your erf has two fronts.",
  },
  "camps-bay-cleaning-services": {
    landmarks: ["Camps Bay Beach", "Twelve Apostles backdrop", "Victoria Road strip"],
    microAreas: ["Beta Road climbs", "Theresa Avenue villas", "Glen Beach walkshed"],
    roads: ["Victoria Road", "Kloof Road", "Theresa Avenue"],
    apartmentZones: ["Victoria Road apartment belt", "Hillside villa rows"],
    transportAccess: "Victoria Road peak-season traffic—loading zones and precise pins beat circling for bay hunting.",
    propertyTypeDensity: "Beach-adjacent apartments, villas, and short-stay stock — sand and salt air shape realistic mop time.",
    parkingNotes: "Peak-season bays vanish fast on Victoria Road—loading zones and precise pins prevent circling delays.",
    accessNotes: "Stepped access and hillside drives are common; mention intercoms, remotes, and whether crews should use rear doors.",
  },
  "bantry-bay-cleaning-services": {
    landmarks: ["Victoria Road cliff belt", "Klein Windhoek ridge approaches"],
    microAreas: ["Lions Head wind exposure pockets", "Fresnaye-adjacent lanes"],
    roads: ["Victoria Road", "Kloof Road"],
    apartmentZones: ["Compact luxury sectional along Victoria"],
    estates: ["Small gated cliff clusters"],
    transportAccess: "Victoria Road is the main spine—note legal stopping; crews often walk the last stretch from a side road.",
    propertyTypeDensity: "Cliff-side homes and compact luxury apartments—wind-blown grit and glass-heavy living.",
    parkingNotes: "Visitor bays are tight on Victoria—pin loading rules and any concierge hand-off for equipment.",
    accessNotes: "Split levels and intercom-only blocks are common; specify which floor and stairwell to use first.",
  },
  "bergvliet-cleaning-services": {
    landmarks: ["Silvertree centre vicinity", "Reddam and sports-field corridors"],
    microAreas: ["Westlake business park fringe", "Sunnydale-adjacent pockets"],
    roads: ["Kendal Road", "Spine Road", "Boyes Drive approaches"],
    estates: ["Sunnydale estate belt", "Westlake security clusters"],
    transportAccess: "Spine Road feeds school and retail peaks—morning slots often clear faster than late pickups.",
    propertyTypeDensity: "Family houses and townhouses between green belts—garden dust and pet traffic are routine.",
    parkingNotes: "Estate boom codes differ by phase—note visitor vs service gate and where to stop without blocking driveways.",
    accessNotes: "Side drives and double garages—say if crews should enter via the kitchen side when the front slope is steep.",
  },
  "fresnaye-cleaning-services": {
    landmarks: ["Higgovale approaches", "Signal Road ridge"],
    microAreas: ["Kloof Road connector pockets", "Sea Point border lanes"],
    roads: ["Kloof Road", "Kloof Nek Road", "Signal Road"],
    apartmentZones: ["Hillside sectional with split garages"],
    transportAccess: "Kloof Nek feeds City Bowl traffic—buffer arrivals on match or event days when the neck backs up.",
    propertyTypeDensity: "Hillside Seaboard homes and apartments—split levels and sea-view glass under daily wind.",
    parkingNotes: "Steep drives and tight turning circles—pin where a short vehicle can stop legally and safely.",
    accessNotes: "Many homes use rear kitchen access—note remotes, stairs, and any alarm zones crews should avoid.",
  },
  "kenilworth-cleaning-services": {
    landmarks: ["Kenilworth Centre", "Chardonnay Harfield strip"],
    microAreas: ["Harfield Village", "Kenilworth Racecourse fringe"],
    roads: ["Rosmead Avenue", "Wynberg Road", "Summerley Road"],
    apartmentZones: ["Rosmead cottage flats", "Centre-adjacent sectional"],
    transportAccess: "Rosmead carries school and retail peaks—side-street pins help crews avoid mall-side queues.",
    propertyTypeDensity: "Cottages, townhouses, and established gardens—older passages and pet-friendly homes are common.",
    parkingNotes: "Harfield narrow streets favour short parking windows—visitor discs and rear lanes help on-time starts.",
    accessNotes: "Wood floors and side gates—say which entrance to use when garages slope or dogs route through the kitchen.",
  },
  "plumstead-cleaning-services": {
    landmarks: ["The Link retail strip", "Victoria Road Plumstead"],
    microAreas: ["Diep River border pockets", "Wynberg-adjacent lanes"],
    roads: ["Victoria Road", "Main Road (Plumstead)", "Diep River Road"],
    apartmentZones: ["Rail-adjacent townhouse rows"],
    estates: ["Smaller security complexes off Victoria"],
    transportAccess: "Victoria and Main carry school-run peaks—morning arrivals often beat late-afternoon retail traffic.",
    propertyTypeDensity: "Garden homes and townhouses—leaf litter and pet hair steer vacuum-heavy visits.",
    parkingNotes: "Side drives and shared walls—note which bay is yours and whether crews may block a second vehicle.",
    accessNotes: "Split driveways after storms—mention mud lines from gardens so crews sequence outdoor mats early.",
  },
  "rosebank-cleaning-services": {
    landmarks: ["Main Road Rosebank", "Mowbray border"],
    microAreas: ["Liesbeeck Parkway approaches", "Rondebosch fringe duplexes"],
    roads: ["Main Road", "Liesbeeck Parkway", "Trim Street"],
    apartmentZones: ["Student-adjacent duplex corridors"],
    transportAccess: "UCT-term traffic on Main and Liesbeeck—pin side entrances so crews do not queue at the wrong gate.",
    propertyTypeDensity: "Duplexes, student-adjacent flats, and quieter pockets—shared kitchens and stairs are typical.",
    parkingNotes: "Street bays flip fast near Main—loading zones or tenant visitor codes prevent circling delays.",
    accessNotes: "Duplex shared entrances—note unit letter, staircase, and which bathroom set is in scope for the booking.",
  },
  "tamboerskloof-cleaning-services": {
    landmarks: ["Kloof Street head", "Kloof Nek approaches"],
    microAreas: ["Bellevue Road terraces", "Molteno Road pocket"],
    roads: ["Kloof Street", "Bellevue Road", "Camp Street approaches"],
    apartmentZones: ["Kloof Street walk-ups", "Molteno terrace rows"],
    transportAccess: "Kloof Nek and Kloof Street buses—morning discs often easier than late-evening festival-week circling.",
    propertyTypeDensity: "Victorian terraces and compact flats—stairs, narrow passages, and heritage floors.",
    parkingNotes: "Disc parking and short visitor rotations—say if a rear lane or loading slot is pre-approved.",
    accessNotes: "Terrace stairwells vary—specify floor, buzzer, and whether equipment should enter via the kitchen stoop.",
  },
  "vredehoek-cleaning-services": {
    landmarks: ["Deerpark", "Table Mountain slopes"],
    microAreas: ["Derry Street wind pockets", "Gardens border ridges"],
    roads: ["Derry Street", "Vredehoek Avenue", "Kloof Nek Road"],
    apartmentZones: ["Hillside sectional with wind-facing decks"],
    transportAccess: "Bowl winds and Kloof Nek closures—note if crews should avoid peak neck times you already watch.",
    propertyTypeDensity: "Hillside apartments—balcony grit and stair-heavy access dominate briefing.",
    parkingNotes: "Steep one-way loops—pin the bay or pull-in that is legal for a short stop, not just ‘near the corner’.",
    accessNotes: "Wind deposits grit on sills fast—flag balconies when you want dry dusting included in the same visit.",
  },
  "woodstock-cleaning-services": {
    landmarks: ["Albert Road strip", "Salt River fringe"],
    microAreas: ["Lower Main mixed-use", "Victoria Road Woodstock"],
    roads: ["Albert Road", "Victoria Road", "Sir Lowry Road"],
    apartmentZones: ["Loft conversions along Albert", "Victoria Road walk-ups"],
    transportAccess: "Albert Road buses and mixed-use loading—morning slots often beat café and retail peak parking.",
    propertyTypeDensity: "Lofts, studios, and townhouse conversions—construction dust and fine grit recur between builds.",
    parkingNotes: "Loading zones are time-boxed—say which bay is valid for your window and any security desk steps.",
    accessNotes: "Post-renovation fine dust—mention if HEPA-heavy vacuum passes are needed beyond a standard maintenance scope.",
  },
  "zonnebloem-cleaning-services": {
    landmarks: ["District Six museum fringe", "Buitengracht approaches"],
    microAreas: ["Hans Strijdom Avenue pocket", "CBD-adjacent towers"],
    roads: ["Buitengracht Street", "Hans Strijdom", "Nelson Mandela Boulevard approaches"],
    apartmentZones: ["Sectional towers with basement parking", "Hans Strijdom mid-rise belt"],
    transportAccess: "MyCiTi and CBD commuter peaks—service lifts differ from tenant lifts; name the correct bank.",
    propertyTypeDensity: "Apartment towers and mixed-use—lifts, basement bays, and commuter dust near entries.",
    parkingNotes: "Basement visitor rules differ by tower—pin level, remotes, and whether cleaners may use P2 vs P1.",
    accessNotes: "Lower-floor units see more street grit—say if entry mats and lobby-adjacent passages need extra vacuum passes.",
  },
  "table-view-cleaning-services": {
    landmarks: ["Table View beachfront", "Dolphin Beach approaches"],
    microAreas: ["Parklands border pockets", "Bloubergstrand walkshed"],
    roads: ["Blouberg Road", "Piet My Vrou Road", "Marine Drive"],
    estates: ["Big Bay security estates", "Sunningdale cluster approaches"],
    apartmentZones: ["Beach Road sectional", "Marine Drive apartment belt"],
    transportAccess: "Blouberg Road carries beach and school peaks—morning slots often beat late summer afternoon traffic.",
    propertyTypeDensity: "Coastal houses, townhouses, and short-stay stock—sand in sliders and open-plan kitchens is routine.",
    parkingNotes: "Peak-season bays vanish on Marine—loading zones and basement pins prevent lost minutes before cleans start.",
    accessNotes: "Outdoor showers and beach gear—note when sand-heavy passages should be in scope for the same visit.",
  },
  "bellville-cleaning-services": {
    landmarks: ["Tygervalley retail belt", "Karl Bremer Hospital vicinity"],
    microAreas: ["Oakdale", "Eversdal family pockets"],
    roads: ["Voortrekker Road", "Bill Bezuidenhout Avenue", "Jip de Jager Drive"],
    estates: ["Eversdal security estates", "Tyger Waterfront-adjacent complexes"],
    apartmentZones: ["Voortrekker corridor flats", "Tygervalley sectional"],
    transportAccess: "Voortrekker and Jip de Jager carry northern peak traffic—buffer arrivals when schools release.",
    propertyTypeDensity: "Mix of rentals, townhouses, and larger family homes—move-out and pet traffic are common.",
    parkingNotes: "Complex visitor bays vary—note boom codes and whether cleaners should use a rear service gate.",
    accessNotes: "Townhouse clusters share walls—pin unit number and any stair-only access so crews do not start at the wrong door.",
  },
};

export function getLocationGeoHints(slug: string): LocationGeoHints | null {
  return DATA[slug] ?? null;
}
