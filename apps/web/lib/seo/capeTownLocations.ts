/**
 * Canonical Cape Town suburb catalogue for `/locations/[slug]`.
 * Add a row here, then add matching copy in `LOCATION_SEO_PAGES` (`capeTownSeoPages.ts`) for rich OG/intro when needed.
 */

export const HUB_SUFFIX = "-cleaning-services" as const;

export type CapeTownLocationRow = {
  readonly slug: string;
  readonly name: string;
  readonly region: string;
  readonly city: string;
  /** Short keys like `rondebosch` → `/locations/rondebosch-cleaning-services` when a hub exists. */
  readonly nearby: readonly string[];
  /** One suburb-specific line (hero) to reduce cross-page phrasing overlap at scale. */
  readonly uniqueContextLine: string;
};

export const CAPE_TOWN_LOCATIONS = [
  {
    slug: "bantry-bay-cleaning-services",
    name: "Bantry Bay",
    region: "Atlantic Seaboard",
    city: "Cape Town",
    nearby: ["fresnaye", "sea-point", "camps-bay"],
    uniqueContextLine:
      "Bantry Bay is cliff-side Atlantic living—wind, salt spray, and compact luxury layouts that need careful scope on every visit.",
  },
  {
    slug: "bergvliet-cleaning-services",
    name: "Bergvliet",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["plumstead", "wynberg", "constantia"],
    uniqueContextLine:
      "Bergvliet sits between green belts and school runs—garden dust, pets, and weekend sport sand shape what “clean” means here.",
  },
  {
    slug: "camps-bay-cleaning-services",
    name: "Camps Bay",
    region: "Atlantic Seaboard",
    city: "Cape Town",
    nearby: ["sea-point", "bantry-bay", "gardens"],
    uniqueContextLine:
      "Camps Bay pairs beach-day traffic with guest-ready homes—sand in passages and salt on balconies add up fast between turnovers.",
  },
  {
    slug: "claremont-cleaning-services",
    name: "Claremont",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["newlands", "rondebosch", "kenilworth"],
    uniqueContextLine:
      "Claremont blends family homes and leafy streets with school-week intensity—kitchens, passages, and entrances work hard between visits.",
  },
  {
    slug: "fresnaye-cleaning-services",
    name: "Fresnaye",
    region: "Atlantic Seaboard",
    city: "Cape Town",
    nearby: ["sea-point", "bantry-bay", "green-point"],
    uniqueContextLine:
      "Fresnaye is hillside Seaboard living—split levels, sea views, and driveways where access notes save real minutes on the day.",
  },
  {
    slug: "gardens-cleaning-services",
    name: "Gardens",
    region: "City Bowl",
    city: "Cape Town",
    nearby: ["tamboerskloof", "vredehoek", "zonnebloem"],
    uniqueContextLine:
      "Gardens stacks heritage walk-ups, Kloof-adjacent flats, and festival-week footfall—stairs and tight turnovers are the norm.",
  },
  {
    slug: "green-point-cleaning-services",
    name: "Green Point",
    region: "Atlantic Seaboard",
    city: "Cape Town",
    nearby: ["sea-point", "fresnaye", "gardens"],
    uniqueContextLine:
      "Green Point mixes Seaboard apartments with promenade energy—lifts, parking bays, and salty balconies define the typical job.",
  },
  {
    slug: "kenilworth-cleaning-services",
    name: "Kenilworth",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["claremont", "wynberg", "plumstead"],
    uniqueContextLine:
      "Kenilworth is cottages, older passages, and gardens that shed leaves—pet traffic and school-term kitchens keep resets honest.",
  },
  {
    slug: "newlands-cleaning-services",
    name: "Newlands",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["rondebosch", "claremont", "wynberg"],
    uniqueContextLine:
      "Newlands lines village-adjacent streets with tree canopies—outdoor dust and busy family calendars shape every booking.",
  },
  {
    slug: "observatory-cleaning-services",
    name: "Observatory",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["woodstock", "zonnebloem", "rosebank"],
    uniqueContextLine:
      "Observatory is shares, student flats, and walkable Main Road living—compact kitchens and high-turnover bathrooms lead the scope.",
  },
  {
    slug: "plumstead-cleaning-services",
    name: "Plumstead",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["wynberg", "kenilworth", "bergvliet"],
    uniqueContextLine:
      "Plumstead pairs garden homes with school-week traffic—side drives, pets, and leaf litter quietly eat vacuum time.",
  },
  {
    slug: "rondebosch-cleaning-services",
    name: "Rondebosch",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["claremont", "observatory", "newlands"],
    uniqueContextLine:
      "Rondebosch swings between UCT-adjacent rentals and long-standing family streets—split levels and narrow drives are everyday realities.",
  },
  {
    slug: "rosebank-cleaning-services",
    name: "Rosebank",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["rondebosch", "observatory", "wynberg"],
    uniqueContextLine:
      "Rosebank stitches duplex corridors to quieter pockets—student kitchens and shared entrances mean access notes matter.",
  },
  {
    slug: "sea-point-cleaning-services",
    name: "Sea Point",
    region: "Atlantic Seaboard",
    city: "Cape Town",
    nearby: ["green-point", "fresnaye", "bantry-bay"],
    uniqueContextLine:
      "Sea Point is apartments and coastal properties along Main Road—salt air, lifts, and tight turnovers set the pace.",
  },
  {
    slug: "tamboerskloof-cleaning-services",
    name: "Tamboerskloof",
    region: "City Bowl",
    city: "Cape Town",
    nearby: ["gardens", "vredehoek", "woodstock"],
    uniqueContextLine:
      "Tamboerskloof packs Victorian terraces against Kloof’s edge—stairs, street parking, and compact flats dominate the brief.",
  },
  {
    slug: "vredehoek-cleaning-services",
    name: "Vredehoek",
    region: "City Bowl",
    city: "Cape Town",
    nearby: ["gardens", "tamboerskloof", "zonnebloem"],
    uniqueContextLine:
      "Vredehoek climbs the bowl with wind-facing balconies and hillside flats—dust tracks in fast after Cape Doctor weeks.",
  },
  {
    slug: "woodstock-cleaning-services",
    name: "Woodstock",
    region: "City Bowl",
    city: "Cape Town",
    nearby: ["zonnebloem", "observatory", "gardens"],
    uniqueContextLine:
      "Woodstock is lofts and mixed-use spaces between studios and cafés—construction dust and creative schedules shape the reset cadence.",
  },
  {
    slug: "wynberg-cleaning-services",
    name: "Wynberg",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["plumstead", "kenilworth", "constantia"],
    uniqueContextLine:
      "Wynberg layers character homes, parks, and Upper Wynberg pockets—older floors and pet-friendly gardens need scoped time.",
  },
  {
    slug: "zonnebloem-cleaning-services",
    name: "Zonnebloem",
    region: "City Bowl",
    city: "Cape Town",
    nearby: ["gardens", "woodstock", "observatory"],
    uniqueContextLine:
      "Zonnebloem blends apartment towers with commuter-heavy blocks—lifts, basement bays, and weekday dust define most visits.",
  },
  {
    slug: "constantia-cleaning-services",
    name: "Constantia",
    region: "Southern Suburbs",
    city: "Cape Town",
    nearby: ["claremont", "wynberg", "bergvliet", "newlands"],
    uniqueContextLine:
      "Constantia pairs larger plots and tree canopy with busy kitchens—pollen, pet traffic, and entertainment areas need scoped time on every visit.",
  },
  {
    slug: "table-view-cleaning-services",
    name: "Table View",
    region: "Blouberg",
    city: "Cape Town",
    nearby: ["sea-point", "bellville", "durbanville", "camps-bay"],
    uniqueContextLine:
      "Table View mixes coastal sand with family homes—balcony grit, beach-day floors, and open-plan living shape realistic vacuum and mop dwell.",
  },
  {
    slug: "durbanville-cleaning-services",
    name: "Durbanville",
    region: "Northern Suburbs",
    city: "Cape Town",
    nearby: ["bellville", "table-view", "claremont", "cape-town"],
    uniqueContextLine:
      "Durbanville skews toward larger family houses and townhouses—school-week kitchens, garden dust, and multi-bath layouts drive honest scope.",
  },
  {
    slug: "bellville-cleaning-services",
    name: "Bellville",
    region: "Northern Suburbs",
    city: "Cape Town",
    nearby: ["durbanville", "table-view", "kenilworth", "claremont"],
    uniqueContextLine:
      "Bellville balances rentals and family homes—move-out windows, pets, and practical weekday access notes keep visits on schedule.",
  },
] as const satisfies readonly CapeTownLocationRow[];

export type CapeTownLocationSlug = (typeof CAPE_TOWN_LOCATIONS)[number]["slug"];
