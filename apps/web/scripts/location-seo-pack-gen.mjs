/** Generate + validate location SEO content pack */
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const L = [
  ["claremont", "Claremont", "Southern Suburbs", "family homes", "school-week"],
  ["sea-point", "Sea Point", "Atlantic Seaboard", "apartments", "coastal"],
  ["gardens", "Gardens", "City Bowl", "compact flats", "Kloof-side"],
  ["green-point", "Green Point", "Atlantic Seaboard", "mixed-use", "promenade"],
  ["observatory", "Observatory", "Southern Suburbs", "student shares", "Main Road"],
  ["woodstock", "Woodstock", "City Bowl", "lofts", "creative quarter"],
  ["rondebosch", "Rondebosch", "Southern Suburbs", "rentals", "UCT-adjacent"],
  ["newlands", "Newlands", "Southern Suburbs", "leafy homes", "village edge"],
  ["camps-bay", "Camps Bay", "Atlantic Seaboard", "beach homes", "guest-ready"],
  ["bantry-bay", "Bantry Bay", "Atlantic Seaboard", "cliff-side", "luxury"],
  ["fresnaye", "Fresnaye", "Atlantic Seaboard", "hillside", "sea-view"],
  ["higgovale", "Higgovale", "City Bowl", "elevated streets", "quiet pockets"],
  ["oranjezicht", "Oranjezicht", "City Bowl", "mountain breeze", "heritage"],
  ["tamboerskloof", "Tamboerskloof", "City Bowl", "Victorian terraces", "Kloof"],
  ["vredehoek", "Vredehoek", "City Bowl", "wind-facing", "bowl slopes"],
  ["devils-peak", "Devil's Peak", "City Bowl", "steep access", "summit-adjacent"],
  ["university-estate", "University Estate", "Southern Suburbs", "family streets", "calm blocks"],
  ["mouille-point", "Mouille Point", "Atlantic Seaboard", "waterfront", "compact"],
  ["three-anchor-bay", "Three Anchor Bay", "Atlantic Seaboard", "Seaboard", "tight footprints"],
  ["city-bowl", "City Bowl", "City Bowl", "dense urban", "mixed offices"],
  ["salt-river", "Salt River", "City Bowl", "studios", "industrial-creative"],
  ["mowbray", "Mowbray", "Southern Suburbs", "campus fringe", "rentals"],
  ["bishopscourt", "Bishopscourt", "Southern Suburbs", "large plots", "estate-style"],
  ["clifton", "Clifton", "Atlantic Seaboard", "luxury", "clifftop"],
];

function desc(place, line1, mid, cta) {
  const core = `${line1} ${mid} cleaning services in ${place}, Cape Town ${cta}`;
  // tune - actually build manually per row below
  return core;
}

const pack = {};

const metas = {
  claremont:
    "Trusted cleaning services in Claremont, Cape Town for busy homes. Shalean vetted pros deliver reliable resets—peek live slots and lock your quote today.",
  "sea-point":
    "Salt-air apartments need rhythm. Reliable cleaning services in Sea Point, Cape Town from Shalean keep lifts guest-ready. Book online and confirm your quote.",
  gardens:
    "Kloof flats fill with grit. Professional cleaning services in Gardens, Cape Town via Shalean save evenings. Vetted crews tap pricing then reserve your slot.",
  "green-point":
    "Turnovers stack near the stadium. Trusted cleaning services in Green Point, Cape Town flex for hosts. Shalean teams scan openings and quote before you book.",
  observatory:
    "Shared kitchens overflow mid-semester. Vetted cleaning services in Observatory, Cape Town reset flats fast. Browse Shalean times then lock your quote quietly.",
  woodstock:
    "Loft dust follows late nights. Reliable cleaning services in Woodstock, Cape Town revive studios. Compare scope online then schedule your visit with Shalean.",
  rondebosch:
    "Leases flip between terms. Dependable cleaning services in Rondebosch, Cape Town tidy rentals. Vetted crews peek tomorrow slots and secure your quote first.",
  newlands:
    "Leaves ride boots indoors. Trusted cleaning services in Newlands, Cape Town tame mudrooms. Professional resets check openings this week and book your visit.",
  "camps-bay":
    "Sand hides in rugs. Reliable cleaning services in Camps Bay, Cape Town polish coastal homes. Vetted pros confirm totals then reserve your slot today.",
  "bantry-bay":
    "Cliff drives test patience. Discreet cleaning services in Bantry Bay, Cape Town honor boom notes. Trusted Shalean pros message us for a tailored quote tonight.",
  fresnaye:
    "Hillside haze coats glass. Vetted cleaning services in Fresnaye, Cape Town keep views crisp. Reliable crews scan availability then book without stress.",
  higgovale:
    "Steep streets steal time. Trusted cleaning services in Higgovale, Cape Town arrive on schedule. Professional resets request your quote online then pick a day.",
  oranjezicht:
    "Mountain gusts dust counters. Reliable cleaning services in Oranjezicht, Cape Town polish flats fast. Vetted pros see slots then lock your quote easily.",
  tamboerskloof:
    "Victorian stairs eat weekends. Professional cleaning services in Tamboerskloof, Cape Town handle terraces well. Trusted crews roll a quote then pick your visit.",
  vredehoek:
    "Wind weeks fray calm. Vetted cleaning services in Vredehoek, Cape Town restore tidy flats. Browse slots tonight with Shalean then secure your quote quietly.",
  "devils-peak":
    "Steep plots still deserve shine. Trusted cleaning services in Devil's Peak, Cape Town plan tricky access smartly. Book your reset ahead with Shalean.",
  "university-estate":
    "Quiet streets mask busy weeks. Reliable cleaning services in University Estate, Cape Town keep homes guest-ready. Vetted pros view slots and capture your quote.",
  "mouille-point":
    "Sea sand trails indoors. Professional cleaning services in Mouille Point, Cape Town keep flats calm. Trusted turnovers compare tiers then reserve today.",
  "three-anchor-bay":
    "Tiny flats crave rhythm. Vetted cleaning services in Three Anchor Bay, Cape Town steady Seaboard chaos. Shalean quotes fast then you book when ready.",
  "city-bowl":
    "Bowl density piles stress. Trusted cleaning services in City Bowl, Cape Town tidy offices and flats alike. Scan openings now with Shalean and grab your quote.",
  "salt-river":
    "Post-build grit lingers. Reliable cleaning services in Salt River, Cape Town reset workshops fast. Vetted crews spot openings then confirm your quote.",
  mowbray:
    "Semester grime dulls floors. Professional cleaning services in Mowbray, Cape Town prep rentals for checks. Trusted teams tap dates then pull your quote fast.",
  bishopscourt:
    "Big rooms multiply chores. Vetted cleaning services in Bishopscourt, Cape Town scale to your size. Trusted staff outline extras then book with confidence today.",
  clifton:
    "Guests scan every corner. Discreet cleaning services in Clifton, Cape Town guard downtime cliff-side. Vetted pros check slots and get your quote quietly.",
};

const titles = {
  claremont: "Claremont Home Cleaning Services Cape Town | Shalean",
  "sea-point": "Sea Point Apartment Cleaning Services Cape Town | Shalean",
  gardens: "Gardens Flat & Home Cleaning Services Cape Town | Shalean",
  "green-point": "Green Point Home Cleaning Services Cape Town | Shalean",
  observatory: "Observatory Student Flat Cleaning Cape Town | Shalean",
  woodstock: "Woodstock Loft Cleaning Services Cape Town | Shalean",
  rondebosch: "Rondebosch Rental Cleaning Services Cape Town | Shalean",
  newlands: "Newlands Family Home Cleaning Services Cape Town | Shalean",
  "camps-bay": "Camps Bay Coastal Home Cleaning Cape Town | Shalean",
  "bantry-bay": "Bantry Bay Luxury Home Cleaning Cape Town | Shalean",
  fresnaye: "Fresnaye Hillside Home Cleaning Cape Town | Shalean",
  higgovale: "Higgovale Home Cleaning Services Cape Town | Shalean",
  oranjezicht: "Oranjezicht Apartment Cleaning Services Cape Town | Shalean",
  tamboerskloof: "Tamboerskloof House Cleaning Services Cape Town | Shalean",
  vredehoek: "Vredehoek Flat Cleaning Services Cape Town | Shalean",
  "devils-peak": "Devil's Peak Home Cleaning Services Cape Town | Shalean",
  "university-estate": "University Estate Home Cleaning Services Cape Town | Shalean",
  "mouille-point": "Mouille Point Waterfront Cleaning Cape Town | Shalean",
  "three-anchor-bay": "Three Anchor Bay Flat Cleaning Services Cape Town | Shalean",
  "city-bowl": "City Bowl Office & Home Cleaning Cape Town | Shalean",
  "salt-river": "Salt River Studio Cleaning Services Cape Town | Shalean",
  mowbray: "Mowbray Rental Cleaning Services Cape Town | Shalean",
  bishopscourt: "Bishopscourt Large Home Cleaning Cape Town | Shalean",
  clifton: "Clifton Luxury Apartment Cleaning Cape Town | Shalean",
};

const h1s = {
  claremont: "Calm, dependable cleaning for busy Claremont households",
  "sea-point": "Apartment-ready cleaning along Sea Point’s Atlantic edge",
  gardens: "Fresh resets for Gardens flats tucked beside the mountain",
  "green-point": "Turnover-tight cleaning for Green Point’s busy blocks",
  observatory: "Fast, fair resets for Observatory shares and student flats",
  woodstock: "Creative-space cleaning that respects Woodstock rhythms",
  rondebosch: "Rondebosch rentals refreshed between leases and terms",
  newlands: "Leaf-proof cleaning for Newlands homes between seasons",
  "camps-bay": "Beach-day homes polished for guests in Camps Bay",
  "bantry-bay": "Quiet, precise cleaning for Bantry Bay cliff homes",
  fresnaye: "Glass-bright cleaning for Fresnaye’s hillside outlooks",
  higgovale: "Punctual cleaning for Higgovale’s steep, tucked-away streets",
  oranjezicht: "Mountain-dust cleaning for Oranjezicht’s tight flats",
  tamboerskloof: "Terrace-smart cleaning for Tamboerskloof’s Victorian rows",
  vredehoek: "Wind-season resets for Vredehoek’s bowl-facing flats",
  "devils-peak": "Access-aware cleaning for Devil’s Peak homes on the rise",
  "university-estate": "Guest-ready cleaning on University Estate’s quiet streets",
  "mouille-point": "Waterfront flats refreshed after Mouille Point strolls",
  "three-anchor-bay": "Compact Seaboard cleaning for Three Anchor Bay flats",
  "city-bowl": "City Bowl offices and flats reset on tight schedules",
  "salt-river": "Studio and workshop cleaning that clears Salt River dust",
  mowbray: "Inspection-ready cleaning for Mowbray rentals near campus",
  bishopscourt: "Room-scoped cleaning for Bishopscourt’s larger homes",
  clifton: "Discreet cleaning for Clifton pads above the rocks",
};

const intros = {
  claremont:
    "Claremont’s school runs and retail weekends leave kitchens, passages, and entrances working overtime. Shalean briefs vetted Cape Town cleaners on your layout so visits match the rhythm of your home—not a generic checklist.",
  "sea-point":
    "Sea Point living means lifts, salty air, and guests on short notice. We plan arrival windows around apartment blocks and turnover pressure so your Cape Town home reads calm the moment someone walks in.",
  gardens:
    "Gardens stacks heritage walk-ups beside Kloof—stairs, compact wet rooms, and festival-week footfall. Shalean scopes realistic time for Cape Town flats so quotes stay honest and cleaners arrive prepared.",
  "green-point":
    "Green Point blends promenade energy with tight parking and mixed-use blocks. Whether you host often or simply want a dependable weekly reset, Shalean aligns Cape Town cleaning scope with how your space actually gets used.",
  observatory:
    "Observatory mixes shares, student flats, and walkable Main Road living—compact kitchens and high-turnover bathrooms set the tone. Shalean keeps Cape Town bookings scoped so roommates split fair totals and handovers stay drama-free.",
  woodstock:
    "Woodstock pairs lofts, studios, and creative schedules with dust that tracks in fast. Shalean matches Cape Town cleaners to smaller footprints and odd-hour access so your space resets without slowing your week.",
  rondebosch:
    "Rondebosch swings between UCT-adjacent rentals and long-standing family streets—split levels and narrow drives are everyday realities. Shalean notes access and parking so Cape Town teams arrive briefed, not circling.",
  newlands:
    "Newlands lines village-adjacent streets with tree canopies—outdoor dust and busy family calendars shape every booking. Shalean allocates time for Cape Town homes where mudrooms, pets, and kitchens compete for the same weekend hours.",
  "camps-bay":
    "Camps Bay pairs beach-day traffic with guest-ready expectations—sand in passages and salt on balconies add up fast. Shalean scopes Cape Town coastal homes for realistic vacuum and mop dwell before anyone checks in.",
  "bantry-bay":
    "Bantry Bay is cliff-side Atlantic living—wind, salt spray, and compact luxury layouts that need careful scope on every visit. Shalean respects boom notes and visitor parking so Cape Town cleaners meet security expectations quietly.",
  fresnaye:
    "Fresnaye is hillside Seaboard living—split levels, sea views, and driveways where access notes save real minutes on the day. Shalean aligns Cape Town visits with how sunlight and exposure age finishes between professional cleans.",
  higgovale:
    "Higgovale’s elevated streets reward punctuality—every minute on a steep approach matters. Shalean confirms pins and remotes so Cape Town cleaners reach your door on time without half-slot delays.",
  oranjezicht:
    "Oranjezicht catches mountain gusts that dust counters faster than inland suburbs expect. Shalean budgets Cape Town time for small flats where kitchens, glass, and floors show wear before the weekend ends.",
  tamboerskloof:
    "Tamboerskloof packs Victorian terraces against Kloof’s edge—stairs, street parking, and compact flats dominate the brief. Shalean plans Cape Town visits around terrace access and tight turnovers so scope matches the building.",
  vredehoek:
    "Vredehoek climbs the bowl with wind-facing balconies and hillside flats—dust tracks in fast after Cape Doctor weeks. Shalean sequences Cape Town cleans so airflow-heavy rooms get attention without rushing the basics.",
  "devils-peak":
    "Devil’s Peak rewards views with steep drives and tight arrival windows. Shalean coordinates Cape Town access notes so cleaners plan routes, gear, and timing before they ring your intercom.",
  "university-estate":
    "University Estate trades bustle for tree-lined calm—until calendars fill anyway. Shalean keeps Cape Town bookings scoped for family homes where guest rooms, homework zones, and kitchens all compete for the same reset window.",
  "mouille-point":
    "Mouille Point pairs waterfront walks with sand that rides home on shoes and rugs. Shalean scopes Cape Town apartments for turnover-ready finishes without overpromising on tight Seaboard time slots.",
  "three-anchor-bay":
    "Three Anchor Bay packs Seaboard life into compact footprints—every cupboard and corner shows wear faster. Shalean sequences Cape Town visits so small flats still feel deep-cleaned without burning the whole afternoon.",
  "city-bowl":
    "City Bowl density stacks offices beside apartments and late-night noise. Shalean aligns Cape Town scope with mixed-use access, lifts, and weekday dust so commercial and residential cleans stay predictable.",
  "salt-river":
    "Salt River blends studios, workshops, and creative refits where dust returns overnight. Shalean scopes Cape Town visits for hard floors and tight storage so your space resets before the next project day.",
  mowbray:
    "Mowbray sits on the campus fringe where rentals turn over fast and inspections arrive faster. Shalean keeps Cape Town bookings punctual and scoped so bathrooms, floors, and ovens read ready when keys change hands.",
  bishopscourt:
    "Bishopscourt skews toward larger plots where room counts, pets, and entertainment zones multiply scope quietly. Shalean maps Cape Town homes honestly so quotes match real on-site time—not a one-size checklist.",
  clifton:
    "Clifton guests notice scuffs long before they notice the view. Shalean sends discreet Cape Town teams who respect cliff-side access, noise, and privacy while still delivering a polished handover.",
};

const benefits = {
  claremont: [
    "Scoped for Southern Suburb family traffic—kitchens, passages, and pets get honest time.",
    "Vetted Cape Town cleaners briefed on school-week arrivals and driveway quirks.",
    "Transparent totals before you confirm—adjust rooms and extras until the quote fits.",
  ],
  "sea-point": [
    "Lift-aware scheduling for Atlantic Seaboard apartment blocks and tight turnovers.",
    "Salt-air and sand routines built into scope so floors and glass stay guest-ready.",
    "Trusted pros who respect lobby rules, parking, and Cape Town coastal timing.",
  ],
  gardens: [
    "Compact City Bowl layouts where stairs and wet rooms need realistic dwell time.",
    "Kloof-adjacent access notes so Cape Town teams arrive without circling narrow streets.",
    "Flexible slots around festival noise and weekday dust from foot traffic.",
  ],
  "green-point": [
    "Host-ready resets near the promenade—bathrooms, kitchens, and floors prioritized.",
    "Mixed-use access guidance for Cape Town blocks with parking and intercom variance.",
    "Weekly or turnover scope you can scale without renegotiating every visit.",
  ],
  observatory: [
    "Share-friendly scope for student flats—kitchens and baths lead the checklist.",
    "Fair quoting Cape Town roommates can split before anyone commits.",
    "Fast booking paths when Main Road noise and access windows shift daily.",
  ],
  woodstock: [
    "Loft-smart dwell for studios where dust hides in corners and shelving.",
    "Creative-quarter timing that respects odd hours and building quirks.",
    "Trusted resets between shoots, guests, and Cape Town work-from-home weeks.",
  ],
  rondebosch: [
    "Rental-aware scope aligned to agency checklists and lease-end realities.",
    "UCT-term timing that respects quiet hours and weekday access patterns.",
    "Parking and gate notes captured so Cape Town cleaners arrive prepared.",
  ],
  newlands: [
    "Tree-canopy homes where outdoor dust and pet traffic shape vacuum time.",
    "Village-adjacent streets with realistic dwell for kitchens and mudrooms.",
    "Professional Cape Town crews who pace detail without rushing family spaces.",
  ],
  "camps-bay": [
    "Coastal resets after beach days—sand, salt, and balconies budgeted honestly.",
    "Guest-ready presentation for Cape Town short-stays and family weekends alike.",
    "Scoped deep or standard tiers so you only pay for the intensity you need.",
  ],
  "bantry-bay": [
    "Luxury-home discretion with cliff-side access and visitor parking spelled out.",
    "Wind-and-salt aware scope for finishes that age faster than inland suburbs.",
    "Trusted Cape Town pros matched to security expectations and tight arrivals.",
  ],
  fresnaye: [
    "Hillside glass and decks where views mean more wipe cycles than average flats.",
    "Split-level access planning so Cape Town teams do not lose half slots parking.",
    "Reliable scheduling when sea haze and pollen track indoors between visits.",
  ],
  higgovale: [
    "Steep-street punctuality with pins, remotes, and visitor rules captured upfront.",
    "Elevated homes where kitchens still work hard despite quieter street noise.",
    "Vetted Cape Town cleaners who respect time-boxed arrivals on inclines.",
  ],
  oranjezicht: [
    "Mountain-gust flats where counters and sills collect grit between weekends.",
    "Compact layouts with realistic dwell for kitchens, baths, and living zones.",
    "Trusted pros who pace Cape Town visits without overbooking tight stairwells.",
  ],
  tamboerskloof: [
    "Victorian terraces where stairs, landings, and tight halls need scoped time.",
    "Kloof-edge access notes so Cape Town teams meet intercom and parking reality.",
    "Turnover-ready detail when guest changeovers stack against workweeks.",
  ],
  vredehoek: [
    "Wind-season sequencing for bowl-facing flats where dust returns fast.",
    "Balcony and sill attention without skipping high-traffic kitchen zones.",
    "Reliable Cape Town crews who respect hillside access and lift variance.",
  ],
  "devils-peak": [
    "Steep-access planning so gear and routes match driveways before arrival.",
    "Summit-adjacent homes where scope honors views and tight time windows.",
    "Professional Cape Town resets with intercom and gate detail captured early.",
  ],
  "university-estate": [
    "Quiet-street homes where guest rooms and homework zones compete for time.",
    "Family calendars honored with dependable weekly or once-off Cape Town visits.",
    "Trusted scope that scales to entertaining weeks without surprise add-ons.",
  ],
  "mouille-point": [
    "Waterfront sand routines for rugs, runners, and balcony tracks.",
    "Compact flats where turnover-ready bathrooms and kitchens lead the brief.",
    "Trusted Cape Town timing around promenade walks and weekend guests.",
  ],
  "three-anchor-bay": [
    "Seaboard compact homes where every cupboard shows wear between visits.",
    "Scoped dwell for tight footprints without skipping high-touch zones.",
    "Reliable Cape Town crews who respect intercom variance and visitor parking.",
  ],
  "city-bowl": [
    "Dense urban mixes—offices beside apartments with weekday dust patterns.",
    "Lift and lobby guidance so Cape Town teams clear security smoothly.",
    "Flexible scope for commercial touch-ups or residential deep resets.",
  ],
  "salt-river": [
    "Studio and workshop dust where fine grit returns after creative workdays.",
    "Hard-floor focus with realistic dwell for Cape Town creative spaces.",
    "Fast quotes when tight timelines sit between shoots and client visits.",
  ],
  mowbray: [
    "Campus-fringe rentals where inspections and handovers land on short notice.",
    "Punctual Cape Town crews scoped for bathrooms, floors, and ovens first.",
    "Fair totals roommates can confirm before anyone taps pay.",
  ],
  bishopscourt: [
    "Large-home room counts with honest extras for pets, ovens, and entertainment zones.",
    "Estate-style access captured so Cape Town teams bring the right dwell time.",
    "Professional scope that scales without turning every visit into a deep clean.",
  ],
  clifton: [
    "Luxury discretion for clifftop pads—privacy, noise, and access respected.",
    "Guest-ready polish where finishes and glass face harsh Atlantic exposure.",
    "Vetted Cape Town pros matched to high-expectation turnovers and weekly care.",
  ],
};

const ctas = {
  claremont: "Start a Claremont quote online—see your total before you book.",
  "sea-point": "Pick a Sea Point slot that fits lifts and arrivals—pricing stays clear.",
  gardens: "Tell us your Gardens access details and lock a calm weekly reset.",
  "green-point": "Compare turnover vs weekly scope for Green Point—then confirm in minutes.",
  observatory: "Split a fair Observatory total with flatmates, then lock your visit.",
  woodstock: "Scope your Woodstock loft online and book when the studio finally needs air.",
  rondebosch: "Line up a Rondebosch rental reset—quote first, keys second.",
  newlands: "Book a Newlands visit that respects leaf season and family Saturdays.",
  "camps-bay": "Refresh Camps Bay after beach days—choose depth, then confirm pricing.",
  "bantry-bay": "Share Bantry Bay access notes once—quiet arrivals, polished handovers.",
  fresnaye: "Keep Fresnaye views crisp—grab a hillside quote with honest dwell time.",
  higgovale: "Lock Higgovale timing that respects steep streets and your calendar.",
  oranjezicht: "Clear Oranjezicht dust fast—see slots and totals before you commit.",
  tamboerskloof: "Plan terrace-smart Tamboerskloof cleans—book when Victorian weeks overflow.",
  vredehoek: "Tame Vredehoek wind weeks—reserve a bowl-facing reset with clear scope.",
  "devils-peak": "Book Devil’s Peak with access-first notes—arrive-ready Cape Town teams.",
  "university-estate": "Keep University Estate guest-ready—outline rooms, then secure your slot.",
  "mouille-point": "Shake Mouille Point sand from rugs—quote waterfront scope in one pass.",
  "three-anchor-bay": "Steady tiny Seaboard flats—lock Three Anchor Bay scope without guesswork.",
  "city-bowl": "Reset City Bowl offices or flats—pick scope, peek totals, then book.",
  "salt-river": "Clear Salt River studio dust—choose a slot that fits workshop weeks.",
  mowbray: "Prep Mowbray rentals for inspection—confirm bathrooms and floors first.",
  bishopscourt: "Map Bishopscourt room counts honestly—extras stay visible before checkout.",
  clifton: "Request discreet Clifton service—private slots and clear totals upfront.",
};

for (const [slug, place] of L) {
  const t = titles[slug];
  const d = metas[slug];
  if (t.length < 50 || t.length > 60) console.error("TITLE", slug, t.length, t);
  if (d.length < 140 || d.length > 160) console.error("DESC", slug, d.length);
  if (!d.includes(`cleaning services in ${place}`)) console.error("PHRASE", slug);
  if (!d.includes("Cape Town")) console.error("CT", slug);
  pack[slug] = {
    title: t,
    description: d,
    h1: h1s[slug],
    intro: intros[slug],
    benefits: benefits[slug],
    cta: ctas[slug],
  };
}

const bad = Object.keys(pack).length !== 24;
if (!bad) {
  const json = JSON.stringify(pack, null, 2);
  console.log(json);
  fs.writeFileSync(join(__dirname, "location-seo-pack.json"), json, "utf8");
} else {
  console.error("pack incomplete");
}
