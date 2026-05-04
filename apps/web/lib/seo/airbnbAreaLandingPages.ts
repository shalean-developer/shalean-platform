/**
 * Suburb-focused Airbnb turnover landing pages → `/services/airbnb-cleaning-{area}`.
 * Central hub remains `/services/airbnb-cleaning-cape-town`.
 */

export type AirbnbAreaLandingKey = "sea-point" | "green-point" | "claremont";

export type AirbnbAreaLandingBlock = {
  key: AirbnbAreaLandingKey;
  path: string;
  title: string;
  description: string;
  h1: string;
  /** Matching `/locations/{slug}` for internal linking */
  locationHubSlug: string;
  areaName: string;
  localLead: string[];
  pricingParagraphs: string[];
  checklistIntro: string;
  checklistBullets: string[];
  /** Unique closing angle + CTA context */
  closingParagraphs: string[];
};

export const AIRBNB_AREA_LANDING_PATHS = [
  "/services/airbnb-cleaning-sea-point",
  "/services/airbnb-cleaning-green-point",
  "/services/airbnb-cleaning-claremont",
] as const;

export const AIRBNB_AREA_LANDINGS: Record<AirbnbAreaLandingKey, AirbnbAreaLandingBlock> = {
  "sea-point": {
    key: "sea-point",
    path: "/services/airbnb-cleaning-sea-point",
    title: "Airbnb Cleaning Services in Sea Point | Shalean",
    description:
      "Guest-ready Airbnb turnover cleaning in Sea Point, Cape Town—Atlantic Seaboard lifts, compact kitchens, and tight guest windows. Pricing bands, checklist, and booking with Shalean.",
    h1: "Airbnb cleaning services in Sea Point",
    locationHubSlug: "sea-point-cleaning-services",
    areaName: "Sea Point",
    localLead: [
      "Sea Point turnovers compete with humidity off the Atlantic, beach sand in entryways, and lift queues in older blocks—guests still expect hotel-fresh bathrooms before they’ve unpacked.",
      "Hosts on Main Road corridors juggle loading zones and visitor parking; crews win minutes when your booking notes spell out bay numbers, intercom steps, and whether trolleys are allowed past concierge.",
      "Many listings are one- and two-bedroom apartments where kitchens and wet areas dominate review photos—scope honesty beats optimistic ‘quick tidy’ assumptions when calendars stack Friday-to-Monday gaps.",
    ],
    pricingParagraphs: [
      "Illustrative bands for Sea Point: compact one-bed turnovers often fall roughly R400–R700 when kitchens stay disciplined between guests; two-bed Atlantic-facing units with dual bathrooms frequently land nearer R550–R950 before heavy add-ons like inside-fridge or linen staging.",
      "What moves quotes fastest: bathroom count, balcony dust after windy weeks, oven or fridge interiors, and realistic time between check-out and the next check-in—lift transfers can shrink effective on-site minutes unless access is crystal clear.",
      "Lock your exact total online—bedrooms, bathrooms, and extras set the price before payment, then align notes to your listing photos so crews budget dwell time honestly.",
    ],
    checklistIntro: "Use this Sea Point turnover QA pass before you release the calendar—or brief Shalean so nothing obvious disappears in wide-angle shots:",
    checklistBullets: [
      "Lobby-to-door route confirmed: intercom, lift fob, and whether cleaners should meet at reception.",
      "Kitchen: hob and sink degreased first; bins refreshed; dishwasher tabs visible if you advertise them.",
      "Bathrooms: glass, chrome, and drains guest-clean; floors vacuumed to edges before mopping—sand tracks fast after Promenade walks.",
      "Living/bed: cushions and throws match gallery shots; remotes aligned; high-touch wipes complete.",
      "Balcony: quick sweep when advertised—coastal grit resets overnight after southeaster days.",
    ],
    closingParagraphs: [
      "Pair this page with our Cape Town-wide Airbnb scope when you manage multiple suburbs—city-wide checklists stay consistent while Sea Point access stays explicit.",
      "For broader suburb FAQs and parking archetypes, open the Sea Point cleaning hub, then return here when you want turnover-specific language for guests and cleaners.",
    ],
  },
  "green-point": {
    key: "green-point",
    path: "/services/airbnb-cleaning-green-point",
    title: "Airbnb Cleaning Services in Green Point | Shalean",
    description:
      "Airbnb turnover cleaning in Green Point near the CBD and Waterfront—stadium weekends, compact lifts, and guest-ready resets. Checklist, pricing context, and online booking.",
    h1: "Airbnb cleaning services in Green Point",
    locationHubSlug: "green-point-cleaning-services",
    areaName: "Green Point",
    localLead: [
      "Green Point mixes event-weekend demand, business travellers, and festival-season noise—turnovers still need calm presentation: neutral scent, streak-free glass, and kitchens that read ‘ready to cook’ in photos.",
      "Many buildings sit close to the CBD loop—loading rules, basement parking ramps, and visitor stickers change block by block; vague ‘park outside’ notes burn the gap you paid for.",
      "Short-stay inventory here often includes balconies facing busy arteries—dust films fast; if guests see railings in listing shots, include balcony scope or accept that reviews may mention ‘outdoor polish.’",
    ],
    pricingParagraphs: [
      "Illustrative Green Point bands: studios and compact one-beds often trend roughly R380–R680 for standard turnovers when ovens stay lightly used; split-level or two-bath layouts commonly approach R550–R920 when kitchens work hard during conference weeks.",
      "Event spikes don’t automatically raise base rates—what raises realistic crew time is mess intensity, extra bathrooms, fridge interiors, linen swaps you supply, and tight same-day buffers that compress drying time.",
      "Confirm scope online before payment; adjust bedrooms, bathrooms, and add-ons until the quote matches what your gallery promises—not what you hope fits in fifty minutes.",
    ],
    checklistIntro: "Green Point host checklist—optimize for CBD-adjacent friction and guest optics:",
    checklistBullets: [
      "Access: loading bay hours, remotes, and whether cleaners should sign in with security.",
      "Kitchen: coffee rings and hob grease—business-travel guests notice immediately on check-in photos.",
      "Bathrooms: exhaust fans and mirrors—compact floorplans amplify steam marks on glass.",
      "Bedrooms: suitcase-scuffed skirting and wardrobe fronts—wide-angle lenses exaggerate scuffs.",
      "Noise calendar: note major stadium nights so crews can plan arrivals when lifts are busiest.",
    ],
    closingParagraphs: [
      "Managing listings across the Atlantic Seaboard? Keep Cape Town-wide Airbnb scope as your parent brief and use this page to localize Green Point access expectations.",
      "Browse the Green Point cleaning hub for suburb-level pricing bands, then book turnovers when your calendar shows the next tight changeover.",
    ],
  },
  claremont: {
    key: "claremont",
    path: "/services/airbnb-cleaning-claremont",
    title: "Airbnb Cleaning Services in Claremont | Shalean",
    description:
      "Airbnb turnover cleaning in Claremont—Southern Suburbs gates, school-week traffic, and family-sized layouts. Local checklist, illustrative pricing, and booking with Shalean.",
    h1: "Airbnb cleaning services in Claremont",
    locationHubSlug: "claremont-cleaning-services",
    areaName: "Claremont",
    localLead: [
      "Claremont turnovers often mean driveways, side gates, and estates with visitor decals—crews need minutes on approach before kitchens even start, especially during school-run peaks on narrow roads.",
      "Larger freestanding and semi-detached inventory is common; guests bring kids, pets as declared, and weekend sports gear—mudrooms and kitchen islands carry more story than a compact Sea Point flat.",
      "Hosts competing with Newlands and Rondebosch listings still win on consistency: predictable linen presentation, bathrooms that photograph bright, and floors that survive WhatsApp walk-through videos.",
    ],
    pricingParagraphs: [
      "Illustrative Claremont bands: two-bed family layouts frequently land roughly R480–R780 when bathrooms stay at steady upkeep; three-bed homes with multiple wet rooms can move toward R650–R1,050 when ovens, fridges, or post-party resets need honest dwell time.",
      "Estates add security steps—not always ‘extra cleaning,’ but minutes before equipment reaches the kitchen; mention guardhouse procedures so quotes reflect arrival reality.",
      "Same pattern as every Shalean turnover: pick bedrooms, bathrooms, and add-ons online—your total prints before checkout so dispatch matches scope.",
    ],
    checklistIntro: "Claremont turnover checklist—optimize for Southern Suburbs access and family-style wear:",
    checklistBullets: [
      "Gate codes, estate rules, and where to park a hatchback with supplies—photos help when bays look identical.",
      "Kitchen: family breakfast debris and sticky dining zones—reset counters before floor work spreads crumbs.",
      "Bathrooms: multiple showers mean parallel grout attention—hair in drains still tops complaint lists.",
      "Stairs and skirting: high-traffic edges show in afternoon light—vacuum direction matters before mopping.",
      "Outdoor shoes and sports bags: stash host clutter off surfaces crews must sanitise.",
    ],
    closingParagraphs: [
      "Running Claremont plus Atlantic Seaboard units? Keep one Cape Town Airbnb playbook and fork access notes per property—your reviews reward predictable presentation, not postcode guesses.",
      "Open the Claremont cleaning hub when you want suburb FAQs beside this turnover-focused guide.",
    ],
  },
};

export function getAirbnbAreaLandingByPath(pathname: string): AirbnbAreaLandingBlock | null {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  for (const block of Object.values(AIRBNB_AREA_LANDINGS)) {
    if (block.path === p) return block;
  }
  return null;
}

/** Location hub slug → dedicated Airbnb landing path when we maintain one */
export function airbnbAreaLandingPathForLocationHub(hubSlug: string): string | null {
  const map: Record<string, string> = {
    "sea-point-cleaning-services": AIRBNB_AREA_LANDINGS["sea-point"].path,
    "green-point-cleaning-services": AIRBNB_AREA_LANDINGS["green-point"].path,
    "claremont-cleaning-services": AIRBNB_AREA_LANDINGS.claremont.path,
  };
  return map[hubSlug] ?? null;
}
