import type { Metadata } from "next";
import { CAPE_TOWN_LOCATIONS_OVERVIEW_PATH, locationHubPathFromAreaInput, type CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { ensureMetaDescriptionKeyword } from "@/lib/seo/location-keyword";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";
import {
  getProgrammaticLocation,
  PROGRAMMATIC_LOCATIONS,
  type ProgrammaticLocationSlug,
} from "@/lib/seo/locations";
import { clampMetaDescription, generateMetaDescription, hubRegionGeoBoostLine } from "@/lib/seo/metaDescription";
import { clipSerpTitle, generateCtrTitle, serviceTitleBaseForCtr } from "@/lib/seo/metaTitle";
import { leadPriceForServiceSlug } from "@/lib/seo/serviceTitleLeadPrice";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";
import {
  getLocationTitleVariant,
  mergeLocationMetaDescription,
  mergeLocationMetaTitle,
} from "@/lib/seo/location-seo-feedback";
import { resolveLocationTitleVariant } from "@/lib/seo/resolve-location-title-variant";
import { buildLocationPageMetaTitleForVariant } from "@/lib/seo/location-title-variants";
import {
  CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF,
  CANONICAL_DEEP_VS_STANDARD_BLOG_HREF,
  CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF,
} from "@/lib/blog/canonicalEditorialBlogLinks";

/** Fallback when hub row is unavailable (should be rare). */
const DEFAULT_LOCATION_META_PRICE_HINT = "~R380–R950+";

/** CTR-focused title (~≤60 chars): primary keyword, illustrative pricing, availability cue. */
export function buildLocationPageMetaTitle(
  suburb: string,
  city: string,
  priceHint: string = DEFAULT_LOCATION_META_PRICE_HINT,
): string {
  const s = suburb.trim();
  const c = city.trim();
  const hint = priceHint.trim() || DEFAULT_LOCATION_META_PRICE_HINT;
  const kwLong = `Cleaning services in ${s}, ${c}`;
  const kwMid = `Cleaning services in ${s}`;
  const avail = "Same-week slots";
  const availShort = "Slots open";
  const candidates = [
    `${kwLong} · ${hint} · ${avail} | Shalean`,
    `${kwLong} · ${hint} · ${availShort} | Shalean`,
    `${kwMid}, ${c} · ${hint} · ${availShort} | Shalean`,
    `${kwLong} · ${hint} | Shalean`,
    `${kwMid} · ${hint} · ${availShort} | Shalean`,
    `${kwLong} | Shalean`,
    `${kwMid} | Shalean`,
  ];
  for (const t of candidates) {
    if (t.length <= 60) return t;
  }
  return `${kwMid} | Shalean`.slice(0, 57).trimEnd() + "…";
}

/** Meta description for suburb hubs — structural variation + hub region geo line + near-me intent (GSC overrides still clamped). */
export function buildLocationPageMetaDescription(
  row: CapeTownLocationRow,
  _priceHint: string = DEFAULT_LOCATION_META_PRICE_HINT,
): string {
  void _priceHint;
  const geoBoost = hubRegionGeoBoostLine(row.region);
  return generateMetaDescription({
    service: "Home cleaning services",
    location: `${row.name}, ${row.city}`,
    variant: "Trusted local cleaners near you",
    geoBoost,
    templateKey: row.slug,
  });
}

export const CAPE_TOWN_SEO_SERVICE_SLUGS = [
  "deep-cleaning-cape-town",
  "standard-cleaning-cape-town",
  "move-out-cleaning-cape-town",
  "office-cleaning-cape-town",
  "airbnb-cleaning-cape-town",
  "carpet-cleaning-cape-town",
  "window-cleaning-cape-town",
] as const;

export type CapeTownSeoServiceSlug = (typeof CAPE_TOWN_SEO_SERVICE_SLUGS)[number];

/** Canonical slugs for `/locations/[slug]` — driven by `PROGRAMMATIC_LOCATIONS`. */
export const LOCATION_SEO_SLUGS = PROGRAMMATIC_LOCATIONS.map((l) => l.slug) as readonly ProgrammaticLocationSlug[];

export type LocationSeoSlug = ProgrammaticLocationSlug;

export type CapeTownServiceSeoBlock = {
  slug: CapeTownSeoServiceSlug;
  path: string;
  /**
   * Human-readable reference for editors — **not** the HTTP `<title>`.
   * Most service routes use `generateCtrTitle()` in `buildCapeTownServiceMetadata()`;
   * `standard-cleaning-cape-town` uses a fixed CTR title string instead.
   */
  title: string;
  description: string;
  /** Optional `<meta name="keywords">` — use sparingly; primary targeting still lives in title, H1, and body copy. */
  keywords?: string[];
  ogImage: string;
  h1: string;
  /** Short booking label for CTAs */
  bookingLabel: string;
  /** Defaults to `/booking/details` in the page component */
  bookingPath?: string;
  /** Defaults to "How this service works in Cape Town" */
  introSectionHeading?: string;
  /** Overrides default "What's included" section `<h2>` when set */
  includedSectionHeading?: string;
  explanation: string[];
  included: string[];
  benefits: { title: string; body: string }[];
  /** e.g. hosts & property managers */
  targetAudience?: { heading: string; paragraphs: string[] };
  /** Replaces default suburb pills when set (e.g. subset + booking link) */
  areaLinks?: { href: string; label: string }[];
  areasSectionHeading?: string;
  areasSectionIntro?: string;
  /** Hero image (required): SEO filename + descriptive alt for LCP and rich previews */
  heroImage: { src: string; alt: string };
  /** 3–5 natural Q&As for on-page FAQ + FAQPage JSON-LD */
  faqs: { q: string; a: string }[];
  /** Intent-focused JSON-LD `name` (shorter than `<title>`); defaults from slug */
  schemaName?: string;
  /** JSON-LD `serviceType` for CleaningService */
  schemaServiceType?: string;
  /**
   * Optional neighbourhood blog guide (service → blog authority loop).
   * Use descriptive `linkAnchorText` (e.g. “cleaning services in Claremont”), not “read more”.
   */
  neighbourhoodBlogGuide?: {
    areaName: string;
    blogPath: string;
    linkAnchorText: string;
  };
  /** Extra neighbourhood guides after the primary (e.g. Claremont + Green Point on deep cleaning). */
  extraNeighbourhoodBlogGuides?: {
    areaName: string;
    blogPath: string;
    linkAnchorText: string;
  }[];
};

/** Default `serviceType` strings for `/services/*-cape-town` JSON-LD */
export const CAPE_TOWN_SERVICE_SCHEMA_SERVICE_TYPE: Record<CapeTownSeoServiceSlug, string> = {
  "deep-cleaning-cape-town": "Deep Cleaning Service",
  "standard-cleaning-cape-town": "Standard Home Cleaning Service",
  "move-out-cleaning-cape-town": "Move-Out Cleaning Service",
  "office-cleaning-cape-town": "Office Cleaning Service",
  "airbnb-cleaning-cape-town": "Airbnb Cleaning Service",
  "carpet-cleaning-cape-town": "Carpet Cleaning Service",
  "window-cleaning-cape-town": "Window Cleaning Service",
};

/** e.g. `airbnb-cleaning-cape-town` → `Airbnb Cleaning Cape Town | Shalean` */
export function defaultCapeTownServiceSchemaName(slug: CapeTownSeoServiceSlug): string {
  const core = slug.replace(/-cape-town$/, "");
  const words = core.split("-").map((w) => (w === "airbnb" ? "Airbnb" : w.charAt(0).toUpperCase() + w.slice(1)));
  return `${words.join(" ")} Cape Town | Shalean`;
}

export function resolveCapeTownServiceSchemaFields(
  slug: CapeTownSeoServiceSlug,
  block: CapeTownServiceSeoBlock,
): { schemaName: string; schemaServiceType: string } {
  return {
    schemaName: block.schemaName ?? defaultCapeTownServiceSchemaName(slug),
    schemaServiceType: block.schemaServiceType ?? CAPE_TOWN_SERVICE_SCHEMA_SERVICE_TYPE[slug],
  };
}

/** Location hub SEO tier — drives ranking-asset sections on `/locations/[slug]`. */
export type LocationRankingTier = "high" | "medium" | "low";

/** Per-hub overrides for which ranking modules render (merged onto tier defaults). */
export type LocationRankingCustomSections = {
  pricing?: boolean;
  nearMe?: boolean;
  localContext?: boolean;
  serviceReinforcement?: boolean;
};

export type LocationSeoBlock = {
  slug: LocationSeoSlug;
  path: string;
  title: string;
  description: string;
  ogImage: string;
  h1: string;
  intro: string[];
  localAngle: string[];
  whyChoose: string[];
  bookingLabel: string;
  /**
   * Ranking depth for programmatic hubs. Omitted or `"low"` = legacy layout only.
   * `"high"` = full ranking asset (pricing, services, Airbnb boost, trust band).
   * `"medium"` = slim asset (pricing + service links + internal links) alongside default sections.
   */
  tier?: LocationRankingTier;
  /** Prefer true for Seaboard / heavy short-stay suburbs — tune Airbnb boost copy. */
  hasAirbnbFocus?: boolean;
  /** Prefer true when apartments dominate property mix — apartments + “near me” module. */
  hasApartmentFocus?: boolean;
  /** Merge overrides onto tier defaults for `resolveLocationRankingSections`. */
  customSections?: LocationRankingCustomSections;
  /**
   * When tier renders a ranking hero, these paragraphs replace the default intro merge.
   * Optional — high-tier hubs without this use template hero intros derived from hub data.
   */
  rankingHeroIntro?: string[];
  /** Replaces default pricing body copy under “Cleaning prices in {area}” when set (high/medium tiers). */
  rankingPricingParagraph?: string;
  /** When `prependCostFaq` applies, overrides the generic cost FAQ answer. */
  rankingCostFaqAnswer?: string;
  /** Fixed nearby hubs for mid-page internal links (labels + paths from catalogue). Max 2 recommended. */
  rankingMidNearbySlugs?: readonly LocationSeoSlug[];
  /** Lead sentence before nearby hub links (default: “Our team also operates across nearby areas including”). */
  rankingMidNearbyLead?: string;
  /** Text after the “cleaning services in {name}” anchor (include leading “for …”). */
  rankingMidAudiencePhrase?: string;
  /** Opening words before the self-link, e.g. “We provide dependable”. Default: “We provide reliable”. */
  rankingMidProvidePrefix?: string;
  /** Replaces the default service-reinforcement sentence in the mid-link block. */
  rankingServiceReinforcementParagraph?: string;
  /** Editorial guide on the blog (hub → blog loop); use strong anchor text, not generic CTAs. */
  relatedBlogGuide?: { href: string; linkAnchorText: string };
  /** Optional extra FAQs; page falls back to programmatic defaults when omitted. */
  faqs?: { q: string; a: string }[];
};

/** Fixed SERP pack for the Sea Point hub — bypasses title-variant rotation and feedback merge. */
function seaPointHubMetaExact(): { title: string; description: string } {
  return {
    title: clipSerpTitle("Cleaning Services Sea Point Cape Town | From R250 | Shalean"),
    description: clampMetaDescription(
      "Book trusted cleaning services in Sea Point Cape Town. Same-day availability, vetted cleaners, and affordable pricing. Get a quote in 60 seconds.",
    ),
  };
}

/** Single source for `<title>`, meta description, OG/Twitter, and JSON-LD descriptions. */
export function resolveLocationSeoMetaFields(
  seo: LocationSeoBlock | null,
  row: CapeTownLocationRow,
): { title: string; description: string } {
  if (row.slug === "sea-point-cleaning-services") {
    return seaPointHubMetaExact();
  }
  const priceHint = getLocationMetaPriceHint(row);
  /** `<title>`: A/B/C templates via `LOCATION_SEO_FEEDBACK_JSON.titleVariant`, or manual `titles` override from GSC. */
  const baseTitle = buildLocationPageMetaTitleForVariant(row, getLocationTitleVariant(row.slug));
  const baseDescription = seo?.description?.trim()
    ? ensureMetaDescriptionKeyword(seo.description.trim(), row)
    : buildLocationPageMetaDescription(row, priceHint);
  return {
    title: mergeLocationMetaTitle(row.slug, baseTitle),
    description: clampMetaDescription(mergeLocationMetaDescription(row.slug, baseDescription)),
  };
}

/** Async variant: includes DB title winner (`seo_auto_title_variant`) when env does not pin `titleVariant`. */
export async function resolveLocationSeoMetaFieldsAsync(
  seo: LocationSeoBlock | null,
  row: CapeTownLocationRow,
): Promise<{ title: string; description: string }> {
  if (row.slug === "sea-point-cleaning-services") {
    return seaPointHubMetaExact();
  }
  const priceHint = getLocationMetaPriceHint(row);
  const variant = await resolveLocationTitleVariant(row.slug);
  const baseTitle = buildLocationPageMetaTitleForVariant(row, variant);
  const baseDescription = seo?.description?.trim()
    ? ensureMetaDescriptionKeyword(seo.description.trim(), row)
    : buildLocationPageMetaDescription(row, priceHint);
  return {
    title: mergeLocationMetaTitle(row.slug, baseTitle),
    description: clampMetaDescription(mergeLocationMetaDescription(row.slug, baseDescription)),
  };
}

export const CAPE_TOWN_SERVICE_SEO: Record<CapeTownSeoServiceSlug, CapeTownServiceSeoBlock> = {
  "deep-cleaning-cape-town": {
    slug: "deep-cleaning-cape-town",
    path: "/services/deep-cleaning-cape-town",
    title: "Deep Cleaning Cape Town | Book Vetted Cleaners | Shalean",
    description:
      "Professional deep cleaning in Cape Town for kitchens, bathrooms, floors, and detail work. Vetted cleaners, clear pricing, and online booking with Shalean.",
    ogImage: "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
    h1: "Deep cleaning services in Cape Town for homes that need a real reset",
    bookingLabel: "deep cleaning",
    introSectionHeading: "How deep cleaning works as a reset visit",
    neighbourhoodBlogGuide: {
      areaName: "Claremont",
      blogPath: "/locations/claremont-cleaning-services",
      linkAnchorText: "cleaning services in Claremont",
    },
    extraNeighbourhoodBlogGuides: [
      {
        areaName: "Green Point",
        blogPath: "/locations/green-point-cleaning-services",
        linkAnchorText: "cleaning services in Green Point",
      },
      {
        areaName: "Gardens",
        blogPath: "/locations/gardens-cleaning-services",
        linkAnchorText: "cleaning services in Gardens",
      },
      {
        areaName: "Camps Bay",
        blogPath: "/locations/camps-bay-cleaning-services",
        linkAnchorText: "cleaning services in Camps Bay",
      },
      {
        areaName: "Constantia",
        blogPath: "/locations/constantia-cleaning-services",
        linkAnchorText: "cleaning services in Constantia",
      },
    ],
    areasSectionIntro:
      "Southern Suburb hubs from Claremont to Rosebank spell out parking, pets, and typical layouts so your booking notes match what teams see on the day. Skim them for neighbourhood context, then confirm this deep cleaning scope for Cape Town before you checkout.",
    explanation: [
      "Deep cleaning is the service Cape Town customers choose when a standard tidy is not enough. Build-up on ovens, grout lines, skirting boards, and bathroom fixtures takes time, and Shalean teams are briefed to work through those detail zones methodically.",
      "Whether you are recovering after renovations, preparing for guests, or refreshing a rental before handover photos, deep cleaning focuses on the areas that change how a space feels day to day across the Western Cape seaboard and Southern Suburbs.",
      "After a reset, most homes return to lighter maintenance: fewer hours on the clock, fewer chemicals, and a checklist built around rhythm rather than recovery. If you only need handover evidence in an empty unit, compare move-out scope instead of defaulting to deep by habit.",
    ],
    included: [
      "Degrease cooktops, appliance fronts, and sink zones where film returns fastest",
      "Descale and polish bathroom sanitaryware, glass, and fixtures that hold limescale",
      "Dust skirting, corners, and high-touch edges—not only open surfaces",
      "Vacuum and mop hard floors with extra passes where grit hides along walls",
      "Living areas and bedrooms worked to a reset checklist you confirm online",
    ],
    benefits: [
      {
        title: "Clear scope before the team arrives",
        body: "You choose home size and add-ons online so the visit matches what you expect—especially important for larger Cape Town family homes.",
      },
      {
        title: "Vetted cleaners with structured checklists",
        body: "Teams follow a consistent process so kitchens and bathrooms receive the extra time deep cleans need.",
      },
      {
        title: "Built for busy Cape Town schedules",
        body: "Pick a slot that fits work-from-home days, school runs, or Airbnb turnovers without endless phone tag.",
      },
    ],
    heroImage: {
      src: "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
      alt: "Professional deep cleaning service in Cape Town kitchen",
    },
    faqs: [
      {
        q: "How long does a deep clean usually take in Cape Town?",
        a: "It depends on home size, bathrooms, extras, and how much build-up there is. Larger Southern Suburb homes and post-renovation resets need more time than a compact apartment. You choose bedrooms, bathrooms, and add-ons online so we can allocate a realistic visit length before the team arrives.",
      },
      {
        q: "What is the difference between deep cleaning and standard cleaning?",
        a: "Standard cleaning maintains a weekly baseline—surfaces, floors, kitchens, and bathrooms on a lighter schedule. Deep cleaning spends extra time on detail zones like grout lines, appliance fronts, skirting, and bathrooms that have accumulated limescale or grease. If you are unsure, start a quote and compare what each tier includes for your rooms.",
      },
      {
        q: "Do I need to be home while the cleaners work?",
        a: "Not always. Many Cape Town customers leave clear access notes, parking guidance, and alarm or estate rules in the booking. If you prefer to meet the team on the first visit, that works too—just mention it in your notes so we can plan arrival.",
      },
      {
        q: "Is deep cleaning a good idea before guests or after renovations?",
        a: "Yes. Deep cleaning is a strong fit when you want kitchens and bathrooms to feel noticeably fresher before hosting, or when dust and trades residue are still settling after building work. Tell us about renovation dust or delicate finishes in your booking notes.",
      },
      {
        q: "Can I book deep cleaning as a once-off without committing to recurring visits?",
        a: "Yes. Many customers use deep cleaning as a seasonal reset, pre-sale refresh, or post-build clean, then return to lighter schedules later. Choose once-off during booking and add bedrooms, bathrooms, and extras so the quote reflects the time the job truly needs.",
      },
    ],
  },
  "standard-cleaning-cape-town": {
    slug: "standard-cleaning-cape-town",
    path: "/services/standard-cleaning-cape-town",
    title: "Cleaning Services Cape Town from R250 | Book Today | Shalean",
    description:
      "House cleaning in Cape Town for weekly or once-off visits—kitchens, bathrooms, and floors on a checklist you confirm online. Transparent quotes and vetted Shalean cleaners.",
    ogImage: "/images/marketing/standard-cleaning-cape-town-kitchen.webp",
    h1: "Cleaning Services Cape Town",
    schemaName: "Cleaning Services Cape Town | Shalean",
    bookingLabel: "standard cleaning",
    introSectionHeading: "How standard cleaning works in Cape Town",
    includedSectionHeading: "What's included in our cleaning service",
    neighbourhoodBlogGuide: {
      areaName: "Claremont",
      blogPath: "/locations/claremont-cleaning-services",
      linkAnchorText: "cleaning services in Claremont",
    },
    extraNeighbourhoodBlogGuides: [
      {
        areaName: "Camps Bay",
        blogPath: "/locations/camps-bay-cleaning-services",
        linkAnchorText: "cleaning services in Camps Bay",
      },
      {
        areaName: "Wynberg",
        blogPath: "/locations/wynberg-cleaning-services",
        linkAnchorText: "cleaning services in Wynberg",
      },
      {
        areaName: "Observatory",
        blogPath: "/locations/observatory-cleaning-services",
        linkAnchorText: "cleaning services in Observatory",
      },
      {
        areaName: "Plumstead",
        blogPath: "/locations/plumstead-cleaning-services",
        linkAnchorText: "cleaning services in Plumstead",
      },
      {
        areaName: "Constantia",
        blogPath: "/locations/constantia-cleaning-services",
        linkAnchorText: "cleaning services in Constantia",
      },
    ],
    areasSectionIntro:
      "Each suburb hub below highlights how standard visits usually run there—stairs, shared drives, school-run timing, and typical room counts. Use them to brief your booking, then align expectations with the baseline checklist on this Cape Town service page.",
    explanation: [
      "Standard cleaning keeps Cape Town apartments and houses in a steady rhythm: floors walked daily, kitchens used nightly, and bathrooms that need dependable sanitisation without booking a full deep clean every time.",
      "It suits professionals near the CBD, families in the Southern Suburbs, and lock-up-and-go homes that still deserve a reliable reset on a predictable schedule.",
      "Think maintenance, not recovery: visits stay within the dwell you booked so weekly or fortnightly plans stay honest. When wet rooms or kitchens outgrow that clock, switch tier for a single deeper visit, then return here.",
    ],
    included: [
      "Kitchen surfaces, appliance exteriors, and sink area on a maintenance checklist",
      "Bathroom sanitisation and fixture wipe-downs for routine hygiene",
      "Dusting reachable surfaces in living areas and bedrooms between deeper passes",
      "Vacuuming carpets and rugs where applicable to keep grit shallow",
      "Mopping hard floors on the cadence tied to your booking frequency",
    ],
    benefits: [
      {
        title: "Predictable quality between deep cleans",
        body: "Maintain a baseline that makes deep cleans less frequent and weekend recovery time shorter.",
      },
      {
        title: "Transparent pricing before checkout",
        body: "See how bedrooms, bathrooms, and extras affect your total for Cape Town properties.",
      },
      {
        title: "Easy rebooking after your first visit",
        body: "Save details securely and return when you need the same team rhythm again.",
      },
    ],
    heroImage: {
      src: "/images/marketing/standard-cleaning-cape-town-kitchen.webp",
      alt: "Professional standard home cleaning service in a Cape Town kitchen and living space",
    },
    faqs: [
      {
        q: "Can I book recurring standard cleaning for my Cape Town home?",
        a: "Yes. Weekly, bi-weekly, and monthly schedules are common for apartments and family homes that want a steady baseline. You set bedrooms, bathrooms, and extras online, then adjust frequency after your first visit if your needs change.",
      },
      {
        q: "What is typically included in a standard home clean?",
        a: "Standard visits focus on high-use areas: kitchen surfaces and sink, bathroom sanitisation, dusting of reachable surfaces, vacuuming carpets and rugs where applicable, and mopping hard floors according to your booking scope. Exact inclusions follow the checklist tied to your quote.",
      },
      {
        q: "How do I know what standard cleaning will cost before I pay?",
        a: "Pricing is based on home size, bedrooms, bathrooms, extras, and your selected time slot. Shalean shows a live total during booking so you can compare options before checkout—no surprise surcharges for items that are already in your selected scope.",
      },
      {
        q: "Do cleaners bring supplies and equipment?",
        a: "Yes. Teams arrive with professional supplies suited to typical Cape Town finishes. If you prefer specific products—for example on wooden floors or stone—add that to your booking notes and we will align where possible.",
      },
      {
        q: "What if my home needs more than standard cleaning this month?",
        a: "You can book a deeper tier for a single visit when bathrooms or kitchens have extra build-up, then return to standard cadence afterwards. Compare tiers in the booking flow so time and pricing match the condition you are seeing today.",
      },
    ],
  },
  "move-out-cleaning-cape-town": {
    slug: "move-out-cleaning-cape-town",
    path: "/services/move-out-cleaning-cape-town",
    title: "Move Out Cleaning Cape Town | End of Tenancy Cleaning | Shalean",
    description:
      "Move-out and end-of-tenancy cleaning in Cape Town—kitchens, bathrooms, cupboards, and inspection-ready detail for tenants and landlords. Book online with Shalean.",
    keywords: ["move out cleaning cape town", "end of tenancy cleaning cape town"],
    ogImage: "/images/marketing/move-out-cleaning-cape-town-handover.webp",
    h1: "Move Out & End of Tenancy Cleaning Services in Cape Town",
    bookingLabel: "move-out cleaning",
    neighbourhoodBlogGuide: {
      areaName: "Claremont",
      blogPath: "/locations/claremont-cleaning-services",
      linkAnchorText: "cleaning services in Claremont",
    },
    extraNeighbourhoodBlogGuides: [
      {
        areaName: "Rondebosch",
        blogPath: "/locations/rondebosch-cleaning-services",
        linkAnchorText: "cleaning services in Rondebosch",
      },
    ],
    introSectionHeading: "Professional move out cleaning for Cape Town rentals",
    includedSectionHeading: "Move Out Cleaning Checklist",
    areasSectionHeading: "Move Out Cleaning Across Cape Town",
    areasSectionIntro:
      "We serve Sea Point, Green Point, Claremont, Rondebosch, Observatory, Wynberg, City Bowl and surrounding areas. Explore suburb hubs below for parking, building access, and typical layouts—each links back to this move-out guide.",
    explanation: [
      "Moving out? Our professional move out cleaning in Cape Town ensures your home is spotless and ready for inspection. Whether you're a tenant, landlord, or property manager, we provide detailed end of tenancy cleaning that meets rental standards and helps secure your deposit.",
      "We clean everything from kitchens and bathrooms to inside cupboards, appliances, and hard-to-reach areas — so you leave your property in perfect condition.",
      "End-of-lease timelines stack fast: inventory checks, deposit deadlines, and keys due the same morning. A structured move-out scope concentrates on what inspectors notice first—grease, limescale, floor edges, and built-up dust—while you coordinate movers and access.",
    ],
    included: [
      "Deep kitchen cleaning (oven, stove, cupboards)",
      "Bathroom sanitisation (tiles, grout, toilet, shower)",
      "Inside cupboards and wardrobes",
      "Skirting boards and wall spot cleaning",
      "Floors vacuumed and mopped",
      "Window cleaning (interior)",
      "Dust removal (including high areas)",
    ],
    benefits: [
      {
        title: "Deposit-friendly attention to detail",
        body: "Prioritise the areas that commonly appear on Western Cape rental inspection sheets.",
      },
      {
        title: "Coordinate around your move date",
        body: "Book the slot that sits between packing chaos and the final walkthrough.",
      },
      {
        title: "One invoice, online payment",
        body: "Keep records simple when you are already managing movers and utilities.",
      },
    ],
    heroImage: {
      src: "/images/marketing/move-out-cleaning-cape-town-handover.webp",
      alt: "Move-out cleaning for a handover-ready Cape Town home before keys are returned",
    },
    faqs: [
      {
        q: "How much is move out cleaning in Cape Town?",
        a: "Prices start from R980 depending on property size. Your live total reflects bedrooms, bathrooms, condition, and any add-ons—check instant pricing online before you confirm.",
      },
      {
        q: "Do you guarantee deposit return cleaning?",
        a: "We follow agency-approved cleaning checklists to meet inspection standards. Deposit outcomes still depend on your lease, inventory, and any repairs or issues outside cleaning.",
      },
      {
        q: "How long does move out cleaning take?",
        a: "Typically 3–6 hours depending on the size of the property and the tier you book. Larger homes or heavy build-up may need more time—your quote aligns hours with the scope you select.",
      },
      {
        q: "When should I schedule move-out cleaning around handover day?",
        a: "Book after furniture is out and rubbish is cleared, but while you still have access for a final walkthrough. Many tenants aim for the day before keys are due so there is buffer if the agency requests touch-ups. Add your handover time in booking notes so we can suggest a realistic slot.",
      },
      {
        q: "Can a landlord book move-out cleaning for an outgoing tenant?",
        a: "Yes. Landlords and agents often book ahead of new tenants or viewings. Use the booking flow to specify access, parking, and any estate security steps so cleaners can complete the scope without delays.",
      },
    ],
  },
  "office-cleaning-cape-town": {
    slug: "office-cleaning-cape-town",
    path: "/services/office-cleaning-cape-town",
    title: "Office Cleaning Cape Town | Small Workspaces | Shalean",
    description:
      "Office cleaning in Cape Town for small teams, studios, and hybrid workspaces. Sanitised kitchens, bathrooms, and desks—book consistent visits with Shalean.",
    ogImage: "/images/marketing/office-cleaning-cape-town-workspace.webp",
    h1: "Office cleaning services in Cape Town for productive, presentable workspaces",
    bookingLabel: "office cleaning",
    areasSectionIntro:
      "Studios near Rosebank duplexes behave differently from Newlands village-adjacent offices. Skim the suburb hubs for access and parking norms, then map your workspace visit to the checklist on this Cape Town office cleaning page.",
    explanation: [
      "Small offices, agency studios, and hybrid workspaces across Cape Town need the same fundamentals as homes—sanitised kitchens, presentable bathrooms, dust-free desks, and floors that look professional when clients visit.",
      "Shalean treats office bookings with the same vetted cleaner model as residential work, with scope agreed up front so communal fridges, glass partitions, and high-traffic corridors get proportionate time.",
      "Professional cleaning services for offices mirror house cleaning Cape Town customers expect at home: predictable standards, respectful access, and clear scope. Many teams pair occasional home cleaning services Cape Town bookings with a light office cadence under one account.",
    ],
    included: [
      "Kitchenette and staff fridge exterior wipe-down",
      "Bathroom and basin sanitisation for shared facilities",
      "Meeting room tidy, surface dust, and chair-line vacuum as scoped",
      "Reception and open-plan desk zones vacuumed and spot-cleaned",
      "Bin liner refresh and floor mopping for hard surfaces in scope",
    ],
    benefits: [
      {
        title: "First impressions for walk-in clients",
        body: "Keep reception and meeting areas consistently ready without pulling staff off revenue work.",
      },
      {
        title: "Flexible cadence",
        body: "Choose weekly, bi-weekly, or project cleans around your Cape Town lease and headcount.",
      },
      {
        title: "One partner for home and work",
        body: "Many customers book residential and small-office visits under one account for simpler admin.",
      },
    ],
    heroImage: {
      src: "/images/marketing/office-cleaning-cape-town-workspace.webp",
      alt: "Professional office cleaning team preparing a bright workspace in Cape Town",
    },
    faqs: [
      {
        q: "What kinds of offices do you clean in Cape Town?",
        a: "We focus on small offices, studios, and hybrid workspaces: reception, desks, meeting rooms, kitchenettes, and shared bathrooms. Scope is agreed up front so high-traffic corridors and client-facing areas get enough time without pulling your staff off their work.",
      },
      {
        q: "Can we book office cleaning outside normal business hours?",
        a: "When availability allows, yes—many teams prefer early mornings or late afternoons around the CBD and Southern Suburbs. Tell us your preferred window and access rules in booking notes so we can match you with a slot that fits your lease and security process.",
      },
      {
        q: "How often should a small office schedule cleaning?",
        a: "Most teams on weekly or bi-weekly cadence keep kitchens and bathrooms presentable without weekend catch-up. Heavier foot traffic or client walk-ins may need weekly visits; lighter use can start bi-weekly and adjust after the first clean.",
      },
      {
        q: "Are office cleaners vetted like residential teams?",
        a: "Yes. Shalean uses the same vetted cleaner model for office bookings, with structured checklists and feedback after visits so quality stays visible—not buried in ad-hoc messages.",
      },
      {
        q: "Do you clean large corporate campuses or medical suites?",
        a: "We focus on compact offices and hybrid workspaces rather than large campuses or regulated clinical environments. If you are unsure, start a quote with square metres, headcount, and photos of shared kitchens or bathrooms so we can confirm fit before checkout.",
      },
    ],
  },
  "airbnb-cleaning-cape-town": {
    slug: "airbnb-cleaning-cape-town",
    path: "/services/airbnb-cleaning-cape-town",
    title: "Airbnb Cleaning Cape Town | Turnover, Short-Term Rental & Guest Cleaning",
    description:
      "Professional Airbnb cleaning for short-term and vacation rentals in Cape Town—guest turnover for hosts and property managers, rental-ready resets, and vetted cleaners who align with listing photos.",
    ogImage: "/images/marketing/airbnb-cleaning-cape-town-living-room.webp",
    h1: "Airbnb Cleaning & Turnover Services in Cape Town",
    bookingLabel: "Airbnb turnover cleaning",
    bookingPath: "/booking",
    neighbourhoodBlogGuide: {
      areaName: "Green Point",
      blogPath: "/locations/green-point-cleaning-services",
      linkAnchorText: "cleaning services in Green Point",
    },
    introSectionHeading: "Built for Airbnb hosts, property managers & short-term rental owners",
    areasSectionIntro:
      "Turnover pressure is street-specific—tight lifts on the Atlantic Seaboard versus Southern Suburb gates and school traffic. The hubs below capture local access cues; combine them with this Cape Town Airbnb cleaning checklist for consistent guest-ready results.",
    explanation: [
      "Between back-to-back guests, calendar gaps, and same-day check-outs, Airbnb hosts need a turnover partner that respects inventory photos, linen resets, and tight handover windows—not just a generic tidy.",
      "Shalean focuses on short-stay and vacation rental realities across Cape Town: sand tracked in from the beach, coffee rings on dining tables, and bathrooms that must read “hotel fresh” before your next review arrives.",
      "Hosts still compare house cleaning Cape Town providers on speed and trust; professional cleaning services built for turnovers layer staging, odour control, and high-touch wipes on top of standard home cleaning services Cape Town guests expect between stays.",
      "Most negative turnover feedback is not “mystery dirt”—it is missed high-touch points, weak bathroom presentation, or kitchen surfaces that look fine in person but read tired in wide-angle photos. We structure time so those zones do not get squeezed when parking or lift access runs long.",
      "Property managers running multiple units benefit from the same online scope controls as individual hosts: bedrooms, bathrooms, and add-ons set the price before payment, and notes carry estate rules, remote access, and linen locations so every handover feels repeatable.",
    ],
    included: [
      "Kitchen reset: counters, hob, sink, exterior of appliances, and bin refresh",
      "Bathroom sanitisation, mirrors, fixtures, and restocking of consumables you leave out",
      "Living and bedroom surfaces dusted, floors vacuumed and mopped to photo-ready finish",
      "High-touch points (remotes, handles, switches) wiped down for guest confidence",
      "Turnover extras when selected: linen change staging, inside-fridge wipe, balcony sweep",
    ],
    benefits: [
      {
        title: "Speed that matches your calendar",
        body: "Book tight slots around check-out and check-in so listings flip without losing a night’s revenue.",
      },
      {
        title: "Reliable vetted teams",
        body: "The same structured checklist model we use for homes—applied to guest-ready presentation every time.",
      },
      {
        title: "Consistent guest-ready standards",
        body: "Reduce variance between cleans so ratings stay steady even when you are out of town.",
      },
    ],
    targetAudience: {
      heading: "Who this is for",
      paragraphs: [
        "Independent Airbnb hosts managing one or two Cape Town listings who need dependable turnovers without micromanaging every visit.",
        "Property managers coordinating multiple short-stay units, lockboxes, and remote access—especially across the Southern Suburbs and Atlantic Seaboard corridors.",
        "Short-term rental owners—whether you list on Airbnb, Booking.com, or direct—who want reliable guest turnover cleaning that keeps reviews aligned with your photos.",
      ],
    },
    heroImage: {
      src: "/images/marketing/airbnb-cleaning-cape-town-living-room.webp",
      alt: "Short-stay rental living room after professional Airbnb turnover cleaning in Cape Town",
    },
    faqs: [
      {
        q: "Can you handle same-day check-out and check-in in Cape Town?",
        a: "Often yes, when the gap between guests and cleaner availability lines up. Tight Atlantic Seaboard or CBD turnovers work best when you share exact check-out and check-in times, remote access details, and linen expectations in your booking notes so the team can plan realistically.",
      },
      {
        q: "What is included in a typical Airbnb turnover clean?",
        a: "Turnovers usually cover kitchen reset, bathroom sanitisation and mirrors, living and bedroom surfaces, vacuuming and mopping to a photo-ready finish, bin refresh, and high-touch points like remotes and handles. Add-ons such as linen staging or inside-fridge wipes can be selected when you build your quote.",
      },
      {
        q: "How should I leave access instructions for cleaners?",
        a: "Use the booking notes for gate codes, estate rules, lockbox locations, and Wi-Fi only if needed for equipment. Precise parking guidance for Southern Suburbs streets saves time on narrow roads and school-zone arrivals.",
      },
      {
        q: "Do you restock guest toiletries or change linen?",
        a: "Teams can work with consumables and linen you leave out, and you can add turnover extras when you want staging support. Exact restocking depends on what you supply and what you select in the booking flow—list consumable locations clearly for consistent results.",
      },
      {
        q: "How far ahead should I book during Cape Town peak season?",
        a: "Holiday and summer weeks fill faster—booking as soon as you know check-out times reduces stress. If plans change, update your slot early so we can reallocate capacity and keep your listing on calendar.",
      },
    ],
  },
  "carpet-cleaning-cape-town": {
    slug: "carpet-cleaning-cape-town",
    path: "/services/carpet-cleaning-cape-town",
    title: "Carpet Cleaning Cape Town | Rugs & High Traffic | Shalean",
    description:
      "Carpet cleaning in Cape Town for rugs, bedrooms, and high-traffic rooms. Refresh soft floors alone or with home cleaning—clear pricing from Shalean.",
    ogImage: "/images/marketing/carpet-cleaning-cape-town-sofas-rugs.webp",
    h1: "Carpet cleaning services in Cape Town for fresher rugs, carpets, and high-traffic rooms",
    bookingLabel: "carpet cleaning",
    areasSectionIntro:
      "Rugs in Observatory rentals behave differently from Kenilworth family lounges. Browse the suburb hubs for context on access and typical room mixes, then align carpet scope and any bundled home clean on this Cape Town service page.",
    explanation: [
      "Carpet cleaning helps refresh rooms that collect dust, foot traffic, pet hair, and everyday marks. Shalean makes it easy to add carpet cleaning to a wider home cleaning plan when you want kitchens, bathrooms, and living spaces handled in the same visit.",
      "Carpet cleaning in Cape Town is especially useful in living rooms, bedrooms, rental properties, and homes with children or pets—where soft flooring holds onto dust and marks longer than hard floors.",
      "Pairing soft-floor work with professional cleaning services keeps one team accountable: house cleaning Cape Town customers often bundle hard surfaces first, then home cleaning services Cape Town wide add rug refresh where traffic is heaviest.",
    ],
    included: [
      "High-traffic carpet refresh",
      "Rug and soft-flooring support",
      "Dust and surface lift on agreed carpeted areas",
      "Room-by-room planning aligned to your booking scope",
      "Optional add-on with standard or deep home cleaning where you select it",
    ],
    benefits: [
      {
        title: "Built for busy Cape Town households",
        body: "Ideal for pets, children, rentals, and seasonal resets when lounges and bedrooms need a dependable floor refresh.",
      },
      {
        title: "Clear scope before the team arrives",
        body: "You set rooms, carpeted areas, and service package online so the visit matches what you expect—especially in larger family homes.",
      },
      {
        title: "Transparent pricing before checkout",
        body: "See how room count, carpeted areas, and bundled home cleaning affect your total for Cape Town properties.",
      },
    ],
    heroImage: {
      src: "/images/marketing/carpet-cleaning-cape-town-sofas-rugs.webp",
      alt: "Carpet and upholstery care during a professional carpet cleaning visit in Cape Town",
    },
    faqs: [
      {
        q: "Can I add carpet cleaning to a standard or deep home clean?",
        a: "Yes. Many Cape Town customers bundle carpet or rug refresh with a wider home visit so bedrooms and lounges are handled in one trip. Select carpet scope and any home-clean tier during booking so the team brings enough time for both soft floors and hard surfaces.",
      },
      {
        q: "How is carpet cleaning priced for different home sizes?",
        a: "Quotes reflect carpeted areas, room count, and whether carpet work is standalone or bundled with other services. Your total updates live in the booking flow before you pay—add accurate room notes so pricing matches the visit.",
      },
      {
        q: "Will carpet cleaning help with pet hair and everyday traffic marks?",
        a: "Professional carpet refresh targets dust, hair, and traffic marks on agreed areas. Severe staining or odour may need extra time or specialist treatment—describe pets, rugs versus wall-to-wall carpet, and problem spots in your notes so we can set expectations.",
      },
      {
        q: "How long should I wait before walking on cleaned carpets?",
        a: "Drying time varies with ventilation, fibre type, and humidity. Your team can advise on the day; light foot traffic is often fine sooner on rugs moved to safer zones. Ask in notes if you need a hard finish-by time before guests arrive.",
      },
      {
        q: "Should I vacuum before the carpet team arrives?",
        a: "A quick vacuum of loose debris helps, especially after pets or renovations, but it is not mandatory. Note heavy shedding, recent plaster dust, or damp spots in your booking so the team plans dwell time and ventilation for Cape Town humidity.",
      },
    ],
  },
  "window-cleaning-cape-town": {
    slug: "window-cleaning-cape-town",
    path: "/services/window-cleaning-cape-town",
    title: "Window Cleaning Cape Town | Streak-Free Shine | Shalean",
    description:
      "Professional window cleaning for homes and offices in Cape Town. Interior and exterior cleaning with streak-free results.",
    keywords: [
      "window cleaning cape town",
      "professional window cleaning cape town",
      "residential window cleaning",
      "commercial window cleaning",
      "window cleaners cape town",
    ],
    ogImage: "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
    h1: "Window Cleaning Services in Cape Town",
    bookingLabel: "window cleaning",
    introSectionHeading: "Trusted window cleaning for Cape Town homes and workspaces",
    areasSectionIntro:
      "Atlantic Seaboard apartments and Southern Suburb homes wear salt spray and urban dust differently—browse hubs like Sea Point, Green Point, and Claremont for access cues, then align your window scope with the checklist on this Cape Town page.",
    explanation: [
      "Window cleaning in Cape Town is one of the fastest ways to brighten a space after windy weeks, coastal salt mist, and pollen-heavy seasons. Shalean matches you with vetted window cleaners in Cape Town who work methodically on glass, frames, and tracks so views read clear—not smeared—in afternoon light.",
      "Most bookings focus on realistic reach: balconies and patios you can access, ladder-safe interiors, and estate rules that shape arrival—not improvised ladder stacks at home.",
      "Across Sea Point, Green Point, Claremont, Rondebosch, Wynberg, and the City Bowl, lifts, narrow streets, and Atlantic damp mean preparation notes matter as much as technique—tell us about parking, pets on balconies, and coated glass before checkout.",
    ],
    included: [
      "Interior glass cleaned for streak-free clarity on agreed openings",
      "Exterior glass where safely reachable from balconies, patios, or ground access",
      "Frames and sills wiped down on included openings",
      "Sliding door and window tracks cleared of loose grit where in scope",
      "High windows addressed only within safe reach—confirm heights and access in booking notes",
    ],
    benefits: [
      {
        title: "Residential-ready presentation",
        body: "Living rooms, bedrooms, and patio doors pick up coastal dust fast—scoped window cleaning keeps rentals and family homes photo-ready without DIY ladder risk.",
      },
      {
        title: "Commercial glass clients notice",
        body: "Reception, meeting rooms, and street-facing panes shape first impressions; structured scope keeps small Cape Town offices consistently presentable.",
      },
      {
        title: "Transparent totals before checkout",
        body: "Opening counts, interior versus exterior mix, and bundled home cleans all feed your quote online—fewer surprises on narrow Cape Town access days.",
      },
    ],
    heroImage: {
      src: "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
      alt: "Professional window and glass cleaning at a Cape Town apartment with balcony access",
    },
    faqs: [
      {
        q: "How often should windows be cleaned?",
        a: "Most Cape Town homes benefit from a full window reset every 8–12 weeks if you face the ocean or busy roads; sheltered interiors can stretch longer. Offices with street-facing glass often prefer monthly or bi-weekly cadence—pick frequency in booking notes and we will align time on site.",
      },
      {
        q: "Do you clean high-rise windows?",
        a: "We focus on residential and small commercial openings that teams can reach safely with standard equipment—typically ground-to-mid levels via balconies, patios, or ladder-safe interiors. True high-rise facade work requiring ropes, cradles, or specialised access sits outside our scope; describe your building height in notes so we confirm fit before checkout.",
      },
      {
        q: "Do you bring equipment?",
        a: "Yes. Cleaners arrive with professional squeegees, scrubbers, microfibre, and safe glass solutions suited to typical Cape Town finishes. If your estate mandates specific products or you have coated glass, mention it in booking notes so we can adapt where possible.",
      },
    ],
  },
};

export const LOCATION_SEO_PAGES: Record<LocationSeoSlug, LocationSeoBlock> = {
  "claremont-cleaning-services": {
    slug: "claremont-cleaning-services",
    path: "/locations/claremont-cleaning-services",
    title: "Claremont Cleaning Cape Town | Southern Suburbs | Shalean",
    description:
      "Claremont cleaning in Cape Town for apartments and family homes near schools and retail. Professional home cleaning and deep cleans—book Shalean online.",
    ogImage: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    h1: "Claremont cleaning services in Cape Town for Southern Suburb homes and busy weeks",
    bookingLabel: "cleaning in Claremont",
    tier: "high",
    hasAirbnbFocus: false,
    hasApartmentFocus: true,
    customSections: {
      pricing: true,
      nearMe: true,
      localContext: true,
      serviceReinforcement: true,
    },
    rankingHeroIntro: [
      "Looking for reliable cleaning services in Claremont, Cape Town? We clean apartments near Cavendish Square, student housing around UCT, and family homes across the Southern Suburbs with consistent, high-quality results.",
      "Claremont properties often need flexible scheduling, detailed move-out cleaning, and fast turnaround between tenants. Our vetted cleaners are trained for rental standards, inspections, and everyday home care.",
    ],
    rankingPricingParagraph:
      "Cleaning services in Claremont typically start from around R400–R500 depending on property size and service type. Move-out and deep cleaning may cost more based on condition and inspection requirements.",
    rankingCostFaqAnswer:
      "Cleaning services in Claremont typically start from around R400–R500 depending on the size of the property and service type. Move-out and deep cleaning may cost more based on condition and inspection requirements.",
    rankingMidNearbySlugs: ["rondebosch-cleaning-services", "newlands-cleaning-services"],
    rankingMidNearbyLead: "Also serving nearby areas like",
    rankingMidProvidePrefix: "We provide dependable",
    rankingMidAudiencePhrase: "for student housing, family homes, and rental properties.",
    rankingServiceReinforcementParagraph:
      "From regular home cleaning to detailed move out cleaning, our services are designed for Claremont residents, students, and property managers.",
    relatedBlogGuide: {
      href: CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF,
      linkAnchorText: "Move-out cleaning checklist for Cape Town rentals",
    },
    intro: [
      "Claremont sits where Southern Suburb families, students, and professionals overlap—homes range from compact apartments near Main Road to larger properties tucked off arterial routes. That mix means cleaning requests swing from lease-end resets to recurring school-week upkeep.",
      "Shalean serves Claremont as part of the wider Cape Town footprint, with bookings tailored to your address, bedrooms, bathrooms, and the service intensity you need.",
      "Whether you need house cleaning Cape Town families rely on between terms or professional cleaning services before inspections or tenant changeovers, Claremont addresses still map to the same transparent quoting flow used across the metro.",
    ],
    localAngle: [
      "Proximity to schools and retail means many Claremont households want early-morning or mid-day slots that fit around lifts and errands. Mentioning access instructions and parking in your booking notes helps teams arrive smoothly.",
      "Leaf litter, pets, and high foot traffic between living rooms and kitchens are common—tell us about pets and floor types so we can allocate time realistically.",
    ],
    whyChoose: [
      "Vetted cleaners with structured checklists suited to suburban layouts.",
      "Instant pricing online before you commit—no surprise surcharges for standard scope items.",
      "Support channel if something is missed so we can make it right quickly.",
    ],
  },
  "wynberg-cleaning-services": {
    slug: "wynberg-cleaning-services",
    path: "/locations/wynberg-cleaning-services",
    title: "Wynberg Cleaning Cape Town | Homes & Rentals | Shalean",
    description:
      "Wynberg cleaning for families and busy households—weekly or bi-weekly standard cleans, deep resets, and move-out scope with clear online pricing. Book Shalean teams.",
    ogImage: "/images/marketing/bright-living-room-after-cleaning-cape-town.webp",
    h1: "Wynberg cleaning services in Cape Town near parks, schools, and Main Road",
    bookingLabel: "cleaning in Wynberg",
    tier: "medium",
    hasAirbnbFocus: false,
    hasApartmentFocus: true,
    relatedBlogGuide: {
      href: "/locations/plumstead-cleaning-services",
      linkAnchorText: "Plumstead cleaning services (nearby Southern Suburbs hub)",
    },
    intro: [
      "Wynberg combines older character homes with newer infill—gardens, pets, and school-week traffic mean most households want predictable maintenance cleaning rather than one-off hero visits.",
      "Recurring standard cleans keep kitchens, bathrooms, and floors on a steady rhythm; deep cleans become occasional resets instead of constant catch-up. Shalean quotes bedrooms, bathrooms, and extras upfront so weekly or bi-weekly plans stay transparent.",
      "From Upper Wynberg toward Main Road, note parking and access clearly—Southern Suburb bottlenecks affect arrival windows, and scoped professional cleaning services align time on site with what your booking shows.",
    ],
    localAngle: [
      "If you live near Maynardville or the village pocket, mention gate remotes and pedestrian access so crews start on time.",
      "Flag floor finishes and pet zones in booking notes so maintenance passes stay gentle on wood and tile.",
    ],
    whyChoose: [
      "Standard, deep, and move-out tiers sized for real Wynberg layouts—not generic studio defaults.",
      "Recurring-friendly booking with totals confirmed online before checkout.",
      "Support if something is missed so routines stay reliable for busy families.",
    ],
  },
  "rondebosch-cleaning-services": {
    slug: "rondebosch-cleaning-services",
    path: "/locations/rondebosch-cleaning-services",
    title: "Rondebosch Cleaning Cape Town | Homes & Rentals | Shalean",
    description:
      "Rondebosch cleaning in Cape Town for rentals, student lets, and family houses. Standard, deep, or move-out scope—book vetted Shalean cleaners online.",
    ogImage: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    h1: "Rondebosch cleaning services in Cape Town for students, families, and rentals",
    bookingLabel: "cleaning in Rondebosch",
    tier: "high",
    hasAirbnbFocus: false,
    hasApartmentFocus: true,
    relatedBlogGuide: {
      href: CANONICAL_DEEP_VS_STANDARD_BLOG_HREF,
      linkAnchorText: "Deep vs regular home cleaning in Cape Town",
    },
    intro: [
      "Rondebosch blends university-adjacent rentals with long-standing family streets, so cleaning demand shifts between compact flats that need fast bathroom and kitchen resets and multi-bedroom homes that want fuller floor-to-ceiling attention.",
      "Shalean supports Cape Town customers here with the same online quoting model used across the metro: you set rooms, bathrooms, extras, and intensity, then lock a slot that respects UCT-term noise and access realities where relevant.",
      "When Rondebosch flats need house cleaning Cape Town students can split fairly, pick scoped standard visits; for lease-end, move-out professional cleaning services keep ovens, bathrooms, and floors aligned with agency checklists.",
    ],
    localAngle: [
      "Split-level homes and hillside drives are common—precise address pins and parking guidance prevent delays on narrow roads.",
      "If you are booking around lease-end in a student let, choose move-out scope and add oven or fridge extras where inventory lists require it.",
    ],
    whyChoose: [
      "Scoped visits so you are not paying for deep detail when you only need a mid-term refresh—or vice versa.",
      "Cleaners briefed for Cape Town rental realities: limescale, coastal dust, and high-use kitchens.",
      "Secure card payment and email confirmation so flatmates or landlords share a paper trail easily.",
    ],
  },
  "kenilworth-cleaning-services": {
    slug: "kenilworth-cleaning-services",
    path: "/locations/kenilworth-cleaning-services",
    title: "Kenilworth Cleaning Cape Town | Leafy Suburbs | Shalean",
    description:
      "Kenilworth cleaning in Cape Town for cottages, family homes, and apartments near parks. Standard, deep, and Airbnb-ready cleans—book Shalean online.",
    ogImage: "/images/marketing/house-deep-cleaning-cape-town.webp",
    h1: "Kenilworth cleaning services in Cape Town for leafy homes and busy households",
    bookingLabel: "cleaning in Kenilworth",
    intro: [
      "Kenilworth sits in the heart of Cape Town’s Southern Suburbs—think established gardens, older cottages with character, and newer builds tucked off quieter streets. Sand from weekend sport, pet traffic through passages, and kitchens that work hard during school terms all add up between professional visits.",
      "Shalean serves Kenilworth as part of our wider Cape Town network: you choose bedrooms, bathrooms, extras, and service intensity online, then lock a slot that fits school runs, work-from-home days, or guest changeovers.",
      "Kenilworth customers comparing home cleaning services Cape Town wide still benefit from suburb-specific notes—driveways, dogs, and wooden floors shape how professional cleaning services allocate time on the day.",
    ],
    localAngle: [
      "Many Kenilworth properties have side drives, shared walls, or estate-style access—clear gate codes and parking notes in your booking help teams arrive without circling narrow cul-de-sacs.",
      "If you are near green belts or large trees, mention outdoor dust and leaf debris so we can budget vacuum time realistically for Cape Town’s windy weeks.",
    ],
    whyChoose: [
      "Structured checklists from standard upkeep through deep and move-out cleans, tuned to suburban layouts common in Kenilworth.",
      "Transparent Cape Town pricing before checkout—no guessing once rooms and extras are selected.",
      "Feedback after visits so missed details are visible to operations and can be corrected quickly.",
    ],
  },
  "observatory-cleaning-services": {
    slug: "observatory-cleaning-services",
    path: "/locations/observatory-cleaning-services",
    title: "Observatory Cleaning Cape Town | Shares & Flats | Shalean",
    description:
      "Affordable Observatory cleaning for shared houses and student flats—standard and deep cleans, flexible slots, and clear online pricing. Book Shalean cleaners.",
    ogImage: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    h1: "Observatory cleaning services in Cape Town for rentals, shares, and compact living",
    bookingLabel: "cleaning in Observatory",
    tier: "medium",
    hasAirbnbFocus: false,
    hasApartmentFocus: true,
    relatedBlogGuide: {
      href: "/locations/rosebank-cleaning-services",
      linkAnchorText: "Rosebank cleaning services (student-adjacent corridor)",
    },
    intro: [
      "Observatory mixes student shares, young professionals, and Main Road living—compact kitchens and busy bathrooms reward affordable, repeatable cleaning rather than sporadic deep resets.",
      "Shalean quotes bedrooms, bathrooms, and extras upfront so flatmates can split a fair total; choose standard upkeep for common areas or step up when exams and weekends pile on.",
      "Flexible scheduling suits lecture timetables and shift work—same booking flow as the rest of Cape Town, with scope locked before checkout.",
    ],
    localAngle: [
      "Street parking and gates vary—precise pins and buzzer notes save time during peak traffic.",
      "For shared leases, brief common-area priorities in booking comments so everyone’s expectations match the checklist.",
    ],
    whyChoose: [
      "Budget-aware standard and deep visits sized for shares and small flats—not oversized villa defaults.",
      "Transparent totals online before you pay; easy to coordinate who books.",
      "Vetted teams and feedback if something’s off—quality stays visible outside the house WhatsApp.",
    ],
  },
  "newlands-cleaning-services": {
    slug: "newlands-cleaning-services",
    path: "/locations/newlands-cleaning-services",
    title: "Newlands Cleaning Cape Town | Families & Hosts | Shalean",
    description:
      "Newlands cleaning in Cape Town for family homes, townhouses, and village-adjacent homes. Deep, standard, and Airbnb cleaning—book Shalean online.",
    ogImage: "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
    h1: "Newlands cleaning services in Cape Town for families, hosts, and village-adjacent homes",
    bookingLabel: "cleaning in Newlands",
    intro: [
      "Newlands combines tree-lined streets, village-style shopping, and easy access to the Southern Suburbs corridor—homes here often juggle school-week mess, weekend entertaining, and short-stay guests when families travel out of Cape Town.",
      "Shalean schedules vetted cleaners across Newlands with the same transparent quoting used citywide: bedrooms, bathrooms, extras, and service tier are locked in online before the team is dispatched.",
      "Hosts near the village strip often need home cleaning services Cape Town guests judge on photos first—flag balcony dust, linen resets, and tight check-in windows so professional cleaning services match your calendar.",
    ],
    localAngle: [
      "Hillside homes and split levels are common—mention stairs, parking bays, and any alarm protocols so Cape Town teams can plan equipment carry and timing.",
      "Short-stay hosts near the village should flag linen resets, balcony dust, and tight check-in windows so turnover cleans match guest expectations.",
    ],
    whyChoose: [
      "Guest-ready Airbnb cleans and dependable standard cycles for busy Newlands households.",
      "Cape Town-wide pricing logic with suburb-aware notes for access and pets.",
      "Support channel if something is missed—especially important before handovers or guest arrivals.",
    ],
  },
  "rosebank-cleaning-services": {
    slug: "rosebank-cleaning-services",
    path: "/locations/rosebank-cleaning-services",
    title: "Rosebank Cleaning Cape Town | Duplexes & Lets | Shalean",
    description:
      "Rosebank cleaning in Cape Town for student digs, duplexes, and homes near Rondebosch and Mowbray. Standard, deep, or move-out cleaning—book Shalean online.",
    ogImage: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    h1: "Rosebank cleaning services in Cape Town for students, duplexes, and rental corridors",
    bookingLabel: "cleaning in Rosebank",
    intro: [
      "Rosebank sits where Cape Town’s university-adjacent rentals meet quieter family streets—cleaning demand swings between fast bathroom and kitchen resets in shared flats and fuller home visits for multi-bedroom houses.",
      "Shalean supports Rosebank customers with metro-consistent online booking: choose rooms, bathrooms, extras, and intensity, then confirm pricing before checkout—ideal when flatmates or landlords need a shared paper trail.",
      "Duplex parking and split levels make access notes essential—pair clear gate guidance with the house cleaning Cape Town service tier you need so professional cleaning services arrive ready for Rosebank’s tighter streets.",
    ],
    localAngle: [
      "Split-level duplexes and narrow driveways are frequent—precise pins and parking guidance prevent delays on busy Cape Town arterials.",
      "Lease-end in shared lets often needs move-out scope plus oven or fridge extras—select those during quoting when Western Cape inventory lists require them.",
    ],
    whyChoose: [
      "Scoped visits so Rosebank flats are not quoted like large freestanding homes—and vice versa.",
      "Cleaners briefed for Cape Town rental realities: coastal dust, limescale, and high-use student kitchens.",
      "Card payment and email confirmation so agents, tenants, and flatmates stay aligned.",
    ],
  },
  "sea-point-cleaning-services": {
    slug: "sea-point-cleaning-services",
    path: "/locations/sea-point-cleaning-services",
    title: "Cleaning Services Sea Point Cape Town | From R250 | Shalean",
    description:
      "Book trusted cleaning services in Sea Point Cape Town. Same-day availability, vetted cleaners, and affordable pricing. Get a quote in 60 seconds.",
    ogImage: "/images/marketing/cape-town-house-cleaning-kitchen.webp",
    h1: "Cleaning Services in Sea Point Cape Town",
    bookingLabel: "cleaning in Sea Point",
    tier: "high",
    hasAirbnbFocus: true,
    hasApartmentFocus: true,
    /** Snippet-style pricing lives in `SeaPointLocationEnhancements`; skip duplicate band in ranking asset. */
    customSections: {
      pricing: false,
    },
    rankingHeroIntro: [
      "Looking for reliable cleaning services in Sea Point—or dependable house cleaning Sea Point Cape Town residents book between turnovers—Shalean matches apartments and Airbnb stock with vetted crews and locked totals before you pay. Beach Road blocks, Promenade walks, and salty balconies all change how time stacks up; your quote reflects bedrooms, bathrooms, and add-ons you select online.",
      "Sea Point stays busy because guest turnover and humid seaboard air accelerate grime on glass, rails, and open-plan kitchens. Compact lifts and basement carries shrink effective cleaning minutes unless access notes are precise—exactly why scoped bookings beat vague “make it shiny” chats.",
    ],
    intro: [
      "Cleaning services in Sea Point, Cape Town are built for compact Atlantic Seaboard apartments, older blocks with sea-air exposure, and walkable Main Road living—salt breeze, wind-blown dust, and high-use kitchens add up fast between professional visits.",
      "Shalean schedules vetted cleaners across Sea Point with the same transparent quoting used citywide: bedrooms, bathrooms, extras, and service tier are confirmed online before checkout.",
      "Atlantic Seaboard pricing reflects lifts, coastal wear, and turnover pacing—many compact scopes trend around R450–R650 before add-ons, while larger homes or deeper resets scale upward; your checkout total locks before you pay.",
      "Whether you need house cleaning Cape Town hosts rely on between guests or professional cleaning services before a handover, scoped visits keep kitchens and bathrooms aligned with what your quote shows.",
    ],
    localAngle: [
      "Building access, lifts, and basement parking vary—pin your entrance and mention remotes or security desks so Cape Town teams arrive without delays.",
      "Sea-facing balconies collect salt and grit—note outdoor areas in your booking when you want them included in scope.",
      "Main Road and Regent Road corridors stay busy—precise parking pins (and visitor bays) prevent lost minutes before cleaners reach lifts.",
    ],
    whyChoose: [
      "Turnover-friendly Airbnb cleans and dependable standard cycles for busy Sea Point households.",
      "Online booking with clear totals before you pay—built for Cape Town addresses and real apartment layouts.",
      "Support if something is missed—especially important before guest check-ins or lease inspections.",
    ],
  },
  "green-point-cleaning-services": {
    slug: "green-point-cleaning-services",
    path: "/locations/green-point-cleaning-services",
    title: "Green Point Cleaning Cape Town | Atlantic Seaboard | Shalean",
    description:
      "Green Point cleaning in Cape Town for Atlantic Seaboard apartments, promenade living, and busy hosts. Standard, deep, and Airbnb-ready cleaning—book Shalean online.",
    ogImage: "/images/marketing/cape-town-house-cleaning-kitchen.webp",
    h1: "Green Point cleaning services in Cape Town for Seaboard apartments and walkable living",
    bookingLabel: "cleaning in Green Point",
    tier: "high",
    hasAirbnbFocus: true,
    hasApartmentFocus: true,
    intro: [
      "Green Point pairs compact Atlantic Seaboard blocks with Main Road energy—sea breeze, wind-blown grit, and kitchens that work hard between gym runs and dinner guests.",
      "Shalean dispatches vetted cleaners across Green Point with metro-wide transparent quoting: bedrooms, bathrooms, extras, and intensity are locked in online before checkout.",
      "Whether you need house cleaning Cape Town hosts rely on between stays or a deeper reset before a handover, scoped visits keep bathrooms and kitchens aligned with your quote.",
    ],
    localAngle: [
      "Lifts, intercoms, and basement bays differ by block—pin your entrance and note remotes or concierge steps so teams arrive on time.",
      "Promenade-facing balconies collect salt spray—flag outdoor areas in your booking when you want them in scope.",
    ],
    whyChoose: [
      "Host-friendly turnover cleans plus dependable standard cycles for busy Green Point households.",
      "Clear totals before you pay—built for real apartment layouts across Cape Town.",
      "Support if something is missed before check-ins or inspections.",
    ],
    relatedBlogGuide: {
      href: "/locations/sea-point-cleaning-services",
      linkAnchorText: "Sea Point cleaning services (nearby Atlantic Seaboard hub)",
    },
  },
  "woodstock-cleaning-services": {
    slug: "woodstock-cleaning-services",
    path: "/locations/woodstock-cleaning-services",
    title: "Woodstock Cleaning Cape Town | City Bowl | Shalean",
    description:
      "Woodstock cleaning in Cape Town for creative studios, loft apartments, and mixed-use streets. Standard, deep, and move-out cleaning—book vetted Shalean teams online.",
    ogImage: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    h1: "Woodstock cleaning services in Cape Town for lofts, studios, and fast-moving households",
    bookingLabel: "cleaning in Woodstock",
    intro: [
      "Woodstock blends creative studios, loft conversions, and walkable streets where dust from nearby builds and high-use kitchens stack up fast between professional visits.",
      "Shalean serves Woodstock with the same Cape Town booking flow: address, rooms, extras, and service tier produce an instant total before you confirm.",
      "From compact flats to split-level homes, scoped house cleaning Cape Town residents book here stays honest about time on site—especially when move-out professional cleaning services need agency-ready detail.",
    ],
    localAngle: [
      "Street parking and loading zones vary—precise pins and access notes prevent delays on busy arterials.",
      "If you are near ongoing construction, mention dust levels so vacuum time matches reality.",
    ],
    whyChoose: [
      "Move-out and deep options mapped to rental and loft layouts common in Woodstock.",
      "Online booking with Cape Town-wide pricing logic and clear scope before checkout.",
      "Vetted cleaners and post-visit feedback so quality stays accountable.",
    ],
  },
  "gardens-cleaning-services": {
    slug: "gardens-cleaning-services",
    path: "/locations/gardens-cleaning-services",
    title: "Gardens Cleaning Cape Town | City Bowl | Shalean",
    description:
      "Gardens cleaning in Cape Town for heritage blocks, student-adjacent flats, and City Bowl professionals. Standard, deep, and Airbnb cleaning—book Shalean online.",
    ogImage: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    h1: "Gardens cleaning services in Cape Town for City Bowl apartments and heritage corridors",
    bookingLabel: "cleaning in Gardens",
    tier: "medium",
    hasAirbnbFocus: false,
    hasApartmentFocus: true,
    relatedBlogGuide: {
      href: "/locations/tamboerskloof-cleaning-services",
      linkAnchorText: "Tamboerskloof cleaning services (nearby City Bowl hub)",
    },
    intro: [
      "Gardens mixes heritage apartment blocks, steep streets, and professionals who want predictable resets between Cape Town’s festival weeks and ordinary work nights.",
      "Shalean schedules cleaners across Gardens with transparent quoting: you set rooms, bathrooms, extras, and intensity, then confirm pricing before checkout.",
      "Family homes and older stock often need once-off deep resets between lighter standard cycles—flag stairs, pets, and dusty sills so professional cleaning services match your calendar.",
    ],
    localAngle: [
      "Heritage blocks often mean stairs and narrow passages—note equipment carry constraints in booking comments.",
      "Busy households benefit from seasonal deep cleans before visitors or after renovations—mention dust levels and fragile finishes in booking notes.",
    ],
    whyChoose: [
      "Deep and standard cycles sized for City Bowl layouts—from compact flats to multi-room family homes.",
      "Cape Town-wide pricing with suburb-aware notes for access and pets.",
      "Support channel if something is missed before handovers or big-weekend resets.",
    ],
  },
  "plumstead-cleaning-services": {
    slug: "plumstead-cleaning-services",
    path: "/locations/plumstead-cleaning-services",
    title: "Plumstead Cleaning Cape Town | Southern Suburbs | Shalean",
    description:
      "Plumstead home cleaning for family houses—regular maintenance, weekly or bi-weekly plans, deep resets when needed. Clear quotes online with Shalean.",
    ogImage: "/images/marketing/house-deep-cleaning-cape-town.webp",
    h1: "Plumstead cleaning services in Cape Town for Southern Suburb homes and leafy streets",
    bookingLabel: "cleaning in Plumstead",
    tier: "medium",
    hasAirbnbFocus: false,
    hasApartmentFocus: true,
    relatedBlogGuide: {
      href: "/locations/kenilworth-cleaning-services",
      linkAnchorText: "Kenilworth cleaning services (nearby Southern Suburbs hub)",
    },
    intro: [
      "Plumstead’s quieter streets and family homes reward predictable maintenance cleaning—kitchens, bathrooms, and living zones stay manageable without constant deep resets.",
      "Shalean quotes bedrooms, bathrooms, and extras upfront so you can lock weekly or bi-weekly rhythm or book once-offs when life gets busy.",
      "Gardens, pets, and school-week traffic still track dust inward—scoped professional cleaning services align crew time with what your booking shows.",
    ],
    localAngle: [
      "Side drives and cul-de-sacs—clear gate codes and parking notes help teams start on time.",
      "Mention pets and floor finishes so maintenance passes stay gentle on wood and tile.",
    ],
    whyChoose: [
      "Standard and deep cycles tuned to suburban layouts—not rushed apartment defaults.",
      "Transparent Cape Town pricing before checkout; easy to adjust frequency after your first visit.",
      "Feedback after visits so missed details can be corrected quickly.",
    ],
  },
  "bergvliet-cleaning-services": {
    slug: "bergvliet-cleaning-services",
    path: "/locations/bergvliet-cleaning-services",
    title: "Bergvliet Cleaning Cape Town | Southern Suburbs | Shalean",
    description:
      "Bergvliet cleaning in Cape Town for family homes, leafy streets, and busy school-week calendars. Standard, deep, and move-out cleaning—book Shalean online.",
    ogImage: "/images/marketing/bright-living-room-after-cleaning-cape-town.webp",
    h1: "Bergvliet cleaning services in Cape Town for Southern Suburb homes near parks and schools",
    bookingLabel: "cleaning in Bergvliet",
    intro: [
      "Bergvliet pairs established gardens with quiet residential pockets where pets, weekend sport, and kitchen traffic add up between professional visits.",
      "Shalean schedules vetted cleaners across Bergvliet with the same transparent Cape Town quoting model: bedrooms, bathrooms, extras, and intensity are confirmed online before checkout.",
      "Whether you need recurring standard visits or move-out professional cleaning services aligned with agency checklists, scoped quotes keep time on site honest for real Bergvliet layouts.",
    ],
    localAngle: [
      "Driveways and side gates vary—clear access notes and parking guidance help teams arrive without circling narrow streets.",
      "Leaf litter and outdoor dust spike in windy weeks—mention pets and floor finishes so vacuum time matches your home.",
    ],
    whyChoose: [
      "Deep and standard options mapped to suburban homes common in Bergvliet.",
      "Instant totals before you pay—built for Cape Town addresses and real room counts.",
      "Support if something is missed so quality stays visible to operations.",
    ],
  },
  "fresnaye-cleaning-services": {
    slug: "fresnaye-cleaning-services",
    path: "/locations/fresnaye-cleaning-services",
    title: "Fresnaye Cleaning Cape Town | Atlantic Seaboard | Shalean",
    description:
      "Fresnaye cleaning in Cape Town for hillside homes, sea views, and busy Atlantic Seaboard schedules. Standard, deep, and Airbnb-ready cleaning—book Shalean online.",
    ogImage: "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
    h1: "Fresnaye cleaning services in Cape Town for Seaboard homes and high-traffic kitchens",
    bookingLabel: "cleaning in Fresnaye",
    intro: [
      "Fresnaye blends hillside homes with Atlantic Seaboard exposure—wind-blown grit, salt air, and kitchens that work hard between guests and family weeks.",
      "Shalean dispatches vetted cleaners across Fresnaye with metro-wide transparent quoting: you set rooms, bathrooms, extras, and intensity, then confirm pricing before checkout.",
      "Hosts comparing home cleaning services Cape Town wide still benefit from suburb-aware notes—balcony resets, linen, and tight check-in windows shape how professional cleaning services allocate time.",
    ],
    localAngle: [
      "Split levels and steep drives are common—precise pins and parking guidance prevent delays on narrow roads.",
      "Sea-facing decks collect salt spray—flag outdoor areas when you want them included in scope.",
    ],
    whyChoose: [
      "Turnover-friendly Airbnb cleans and dependable standard cycles for busy Fresnaye households.",
      "Clear totals before you pay—built for real Cape Town apartment and freestanding layouts.",
      "Support if something is missed before guest arrivals or handovers.",
    ],
  },
  "bantry-bay-cleaning-services": {
    slug: "bantry-bay-cleaning-services",
    path: "/locations/bantry-bay-cleaning-services",
    title: "Bantry Bay Cleaning Cape Town | Atlantic Seaboard | Shalean",
    description:
      "Bantry Bay cleaning in Cape Town for cliff-side homes, luxury apartments, and wind-exposed balconies. Standard, deep, and Airbnb cleaning—book Shalean online.",
    ogImage: "/images/marketing/cape-town-house-cleaning-kitchen.webp",
    h1: "Bantry Bay cleaning services in Cape Town for Atlantic Seaboard homes and compact luxury layouts",
    bookingLabel: "cleaning in Bantry Bay",
    intro: [
      "Bantry Bay sits where Atlantic Seaboard exposure meets compact luxury layouts—salt breeze, wind-blown dust, and high-use kitchens stack up fast between professional visits.",
      "Shalean supports Bantry Bay with the same Cape Town booking flow: address, rooms, extras, and service tier produce an instant total before you confirm.",
      "Whether you need house cleaning Cape Town hosts rely on between stays or a deeper reset before a handover, scoped visits keep bathrooms and kitchens aligned with your quote.",
    ],
    localAngle: [
      "Security gates and intercoms vary by block—note remotes, concierge steps, and loading bays so teams arrive smoothly.",
      "Wind-exposed balconies collect grit quickly—mention outdoor areas in your booking when you want them included.",
    ],
    whyChoose: [
      "Host-ready turnover cleans plus dependable standard cycles for busy Bantry Bay households.",
      "Transparent Cape Town pricing before checkout.",
      "Feedback after visits so missed details can be corrected quickly.",
    ],
  },
  "camps-bay-cleaning-services": {
    slug: "camps-bay-cleaning-services",
    path: "/locations/camps-bay-cleaning-services",
    title: "Camps Bay Cleaning Cape Town | Atlantic Seaboard | Shalean",
    description:
      "Camps Bay cleaning for luxury homes and sea-facing apartments—standard, deep, and detail-focused visits with clear scope. Book vetted Shalean cleaners online.",
    ogImage: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    h1: "Camps Bay cleaning services in Cape Town for luxury Seaboard homes, sea-facing apartments, and large layouts",
    bookingLabel: "cleaning in Camps Bay",
    tier: "medium",
    hasAirbnbFocus: false,
    hasApartmentFocus: true,
    relatedBlogGuide: {
      href: "/locations/bantry-bay-cleaning-services",
      linkAnchorText: "Bantry Bay cleaning services (nearby Atlantic Seaboard hub)",
    },
    intro: [
      "Camps Bay pairs luxury finishes with ocean exposure—salt film on glass, balcony grit, and large footprints that reward structured, careful cleaning.",
      "Shalean schedules cleaners across Camps Bay with transparent quoting: bedrooms, bathrooms, extras, and intensity are locked in online before checkout.",
      "Whether you maintain a primary residence or a high-standard rental, scoped professional cleaning services keep kitchens, bathrooms, and living zones aligned with what your quote shows.",
    ],
    localAngle: [
      "Hillside drives and stepped access are common—precise pins and parking notes prevent delays during peak season traffic.",
      "Flag delicate surfaces, stone, and exterior glass expectations in booking notes so crews allocate time for finishes that need a lighter touch.",
    ],
    whyChoose: [
      "Detail-led standard and deep cycles sized for larger Seaboard layouts—not rushed studio defaults.",
      "Clear totals before checkout with suburb-aware notes for access, pets, and outdoor zones.",
      "Support channel if something is missed before handovers or hosted weekends.",
    ],
  },
  "tamboerskloof-cleaning-services": {
    slug: "tamboerskloof-cleaning-services",
    path: "/locations/tamboerskloof-cleaning-services",
    title: "Tamboerskloof Cleaning Cape Town | City Bowl | Shalean",
    description:
      "Tamboerskloof cleaning in Cape Town for Victorian terraces, compact flats, and Kloof-adjacent living. Standard, deep, and move-out cleaning—book Shalean online.",
    ogImage: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    h1: "Tamboerskloof cleaning services in Cape Town for City Bowl terraces, flats, and walkable streets",
    bookingLabel: "cleaning in Tamboerskloof",
    intro: [
      "Tamboerskloof blends Victorian terraces with compact flats where stairs, pets, and busy weeknight kitchens add up between professional visits.",
      "Shalean serves Tamboerskloof with the same Cape Town booking model: set your address, room count, and add-ons, then see an instant total before you pay.",
      "Whether you need recurring standard visits or move-out professional cleaning services aligned with agency checklists, scoped quotes keep time on site honest for real City Bowl layouts.",
    ],
    localAngle: [
      "Street parking and loading zones vary—precise pins and access notes prevent delays on busy arterials.",
      "Heritage homes often mean stairs and narrow passages—note equipment carry constraints in booking comments.",
    ],
    whyChoose: [
      "Move-out and deep options mapped to rental and terrace layouts common in Tamboerskloof.",
      "Online booking with clear scope before checkout.",
      "Vetted cleaners and post-visit feedback so quality stays accountable.",
    ],
  },
  "vredehoek-cleaning-services": {
    slug: "vredehoek-cleaning-services",
    path: "/locations/vredehoek-cleaning-services",
    title: "Vredehoek Cleaning Cape Town | City Bowl | Shalean",
    description:
      "Vredehoek cleaning in Cape Town for hillside apartments, wind-exposed balconies, and City Bowl professionals. Standard, deep, and Airbnb cleaning—book Shalean online.",
    ogImage: "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
    h1: "Vredehoek cleaning services in Cape Town for hillside flats and wind-exposed City Bowl homes",
    bookingLabel: "cleaning in Vredehoek",
    intro: [
      "Vredehoek sits on City Bowl slopes where wind-blown dust, compact kitchens, and balcony exposure add up fast between professional visits.",
      "Shalean supports Vredehoek customers with metro-consistent online booking: choose rooms, bathrooms, extras, and intensity, then confirm pricing before checkout.",
      "Hosts near Kloof-adjacent corridors often need home cleaning services Cape Town guests judge on photos first—flag linen resets and balcony dust so professional cleaning services match your calendar.",
    ],
    localAngle: [
      "Split-level apartments and stepped access are common—precise pins and parking guidance prevent delays.",
      "Short-stay hosts should flag tight check-in windows so turnover cleans match guest expectations.",
    ],
    whyChoose: [
      "Guest-ready Airbnb cleans and dependable standard cycles for busy Vredehoek households.",
      "Transparent Cape Town pricing with suburb-aware notes for access and pets.",
      "Support channel if something is missed before handovers or guest arrivals.",
    ],
  },
  "zonnebloem-cleaning-services": {
    slug: "zonnebloem-cleaning-services",
    path: "/locations/zonnebloem-cleaning-services",
    title: "Zonnebloem Cleaning Cape Town | City Bowl | Shalean",
    description:
      "Zonnebloem cleaning in Cape Town for apartment blocks, mixed-use streets, and City Bowl commuters. Standard, deep, and move-out cleaning—book Shalean online.",
    ogImage: "/images/marketing/house-deep-cleaning-cape-town.webp",
    h1: "Zonnebloem cleaning services in Cape Town for City Bowl apartments and mixed-use corridors",
    bookingLabel: "cleaning in Zonnebloem",
    intro: [
      "Zonnebloem blends apartment blocks with mixed-use streets where lifts, compact kitchens, and commuter-heavy weeks mean predictable cleaning resets matter.",
      "Shalean schedules cleaners across Zonnebloem with transparent quoting: you set rooms, bathrooms, extras, and intensity, then confirm pricing before checkout.",
      "Whether you need house cleaning Cape Town renters split fairly or move-out professional cleaning services aligned with agency checklists, scoped visits keep quotes aligned with on-the-day time.",
    ],
    localAngle: [
      "Building access and basement parking vary—pin your entrance and mention remotes or security desks so teams arrive without delays.",
      "If you are near arterial roads, mention dust levels so vacuum time matches reality.",
    ],
    whyChoose: [
      "Move-out and deep options mapped to rental layouts common in Zonnebloem.",
      "Online booking with Cape Town-wide pricing logic and clear scope before checkout.",
      "Vetted cleaners and post-visit feedback so quality stays accountable.",
    ],
  },
  "constantia-cleaning-services": {
    slug: "constantia-cleaning-services",
    path: "/locations/constantia-cleaning-services",
    title: "Constantia Cleaning Cape Town | Large Homes | Shalean",
    description:
      "Constantia cleaning for large homes and estates—standard, deep, and detail work with upfront quotes. Vetted Shalean teams for premium Southern Suburb properties.",
    ogImage: "/images/marketing/house-deep-cleaning-cape-town.webp",
    h1: "Constantia cleaning services in Cape Town for leafy Southern Suburb homes",
    bookingLabel: "cleaning in Constantia",
    tier: "high",
    hasAirbnbFocus: false,
    hasApartmentFocus: false,
    relatedBlogGuide: {
      href: CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF,
      linkAnchorText: "Airbnb cleaning checklist for Cape Town hosts",
    },
    intro: [
      "Constantia pairs generous floorplans with gardens and tree canopy—pollen, outdoor dust, and multi-room traffic mean structured cleaning beats occasional quick wipes.",
      "Shalean quotes bedrooms, bathrooms, wings, and extras upfront so large layouts get realistic crew time, whether you want recurring maintenance or periodic deep resets.",
      "Estates and drive-in properties benefit from clear access notes—scoped professional cleaning services align what you book with what teams can complete on site.",
    ],
    localAngle: [
      "Driveways, side gates, and pool zones vary—pin parking and any areas to avoid when wet.",
      "Stone, wood, and high-traffic kitchens reward booking notes on finishes and preferred products.",
    ],
    whyChoose: [
      "Standard and deep cycles sized for larger Constantia footprints—not compact-flat defaults.",
      "Structured checklists and vetted teams for premium-home expectations.",
      "Transparent totals before checkout; support if scope needs adjusting after the first visit.",
    ],
  },
  "table-view-cleaning-services": {
    slug: "table-view-cleaning-services",
    path: "/locations/table-view-cleaning-services",
    title: "Table View Cleaning Cape Town | Coastal Homes | Shalean",
    description:
      "Table View cleaning in Cape Town for family houses, coastal apartments, and Airbnb turnovers. Standard, deep, and move-out—book Shalean online.",
    ogImage: "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
    h1: "Table View cleaning services in Cape Town near the beach and Blouberg corridor",
    bookingLabel: "cleaning in Table View",
    intro: [
      "Table View pairs beach sand with busy family calendars—balconies, passages, and open-plan kitchens need realistic vacuum and mop time.",
      "Shalean supports Table View with metro-wide booking: set rooms, bathrooms, extras, and intensity, then lock a slot that fits coastal humidity and drying.",
      "Hosts and residents alike use home cleaning services Cape Town trusts when turnovers are tight—flag guest linen and balcony grit so professional cleaning services match the clock.",
    ],
    localAngle: [
      "Windy weeks push grit through sliders—mention tracks and outdoor mats so crews plan dry passes before wet work.",
      "Estate and complex rules differ—leave intercom, remotes, and visitor parking notes in your booking.",
    ],
    whyChoose: [
      "Airbnb-ready turnovers and dependable standard cycles for Table View households.",
      "Transparent Cape Town pricing with suburb-aware notes for sand, pets, and access.",
      "Support channel if something is missed before guests or handovers.",
    ],
  },
  "durbanville-cleaning-services": {
    slug: "durbanville-cleaning-services",
    path: "/locations/durbanville-cleaning-services",
    title: "Durbanville Cleaning Cape Town | Family Homes | Shalean",
    description:
      "Durbanville cleaning in Cape Town for larger houses, townhouses, and school-week schedules. Book standard, deep, or move-out cleaning online.",
    ogImage: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    h1: "Durbanville cleaning services in Cape Town for Northern Suburb family homes",
    bookingLabel: "cleaning in Durbanville",
    intro: [
      "Durbanville skews toward multi-bedroom homes, townhouses, and busy school-week kitchens—bathrooms and floors work harder than compact flats.",
      "Shalean dispatches vetted cleaners across Durbanville with scoped quotes: you choose rooms, bathrooms, extras, and tier before checkout.",
      "From recurring house cleaning Cape Town families split fairly to move-out professional cleaning services before handovers, Durbanville bookings stay tied to real on-site time.",
    ],
    localAngle: [
      "Driveways and estate gates vary—precise pins and remotes prevent half-slot delays.",
      "Garden dust and pet hair are common—note pets and floor types so vacuum passes match reality.",
    ],
    whyChoose: [
      "Deep and move-out options mapped to larger Northern Suburb layouts.",
      "Online booking with clear Cape Town totals before you pay.",
      "Feedback loop after visits so quality stays visible to operations.",
    ],
  },
  "bellville-cleaning-services": {
    slug: "bellville-cleaning-services",
    path: "/locations/bellville-cleaning-services",
    title: "Bellville Cleaning Cape Town | Rentals & Homes | Shalean",
    description:
      "Bellville cleaning in Cape Town for apartments, family houses, and end-of-lease handovers. Standard, deep, and move-out—book Shalean online.",
    ogImage: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    h1: "Bellville cleaning services in Cape Town for practical Northern Suburb households",
    bookingLabel: "cleaning in Bellville",
    intro: [
      "Bellville balances rentals, family houses, and move-out pressure—kitchens, bathrooms, and floors need dependable scope without guesswork.",
      "Shalean supports Bellville with the same Cape Town booking model: rooms, bathrooms, extras, and tier—then confirm pricing before checkout.",
      "Whether you need home cleaning services Cape Town renters book weekly or move-out professional cleaning services aligned with agencies, notes on access keep visits smooth.",
    ],
    localAngle: [
      "Complex security and visitor parking vary—mention boom gates, remotes, and basement bays.",
      "End-of-lease windows are tight—flag oven and fridge add-ons early so time stays honest.",
    ],
    whyChoose: [
      "Move-out and deep options suited to rental and family layouts common in Bellville.",
      "Transparent pricing with clear scope before you confirm.",
      "Vetted cleaners and structured checklists for high-traffic wet rooms.",
    ],
  },
};

/** Short suburb label for keyword-rich cross-links (e.g. “Airbnb cleaning in Claremont”). */
export const LOCATION_SEO_SHORT_PLACE = Object.fromEntries(
  PROGRAMMATIC_LOCATIONS.map((l) => [l.slug, l.name]),
) as Record<LocationSeoSlug, string>;

const SERVICE_HUB_PHRASE: Record<CapeTownSeoServiceSlug, string> = {
  "deep-cleaning-cape-town": "Deep cleaning",
  "standard-cleaning-cape-town": "Standard cleaning",
  "move-out-cleaning-cape-town": "Move-out cleaning",
  "office-cleaning-cape-town": "Office cleaning",
  "airbnb-cleaning-cape-town": "Airbnb cleaning",
  "carpet-cleaning-cape-town": "Carpet cleaning",
  "window-cleaning-cape-town": "Window cleaning",
};

/** Service SEO page → suburb hubs: “{Service} in Claremont” etc. */
export function serviceHubLocationLinks(serviceSlug: CapeTownSeoServiceSlug): { href: string; label: string }[] {
  const phrase = SERVICE_HUB_PHRASE[serviceSlug];
  return LOCATION_SEO_SLUGS.flatMap((locSlug) => {
    const block = LOCATION_SEO_PAGES[locSlug];
    const place = LOCATION_SEO_SHORT_PLACE[locSlug] ?? getProgrammaticLocation(locSlug)?.name;
    if (!block?.path || !place) return [];
    return [{ href: block.path, label: `${phrase} in ${place}` }];
  });
}

/**
 * Location SEO page → Cape Town-wide service URLs.
 * Anchors name the city (destination pages are /services/*-cape-town).
 */
export function locationHubServiceLinksCapeTownAnchors(): { href: string; label: string }[] {
  return [
    { href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path, label: "Deep cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path, label: "Standard cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path, label: "Office cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path, label: "Carpet cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["window-cleaning-cape-town"].path, label: "Window cleaning in Cape Town" },
  ];
}

export function getCapeTownServiceSeo(slug: string): CapeTownServiceSeoBlock | null {
  return CAPE_TOWN_SERVICE_SEO[slug as CapeTownSeoServiceSlug] ?? null;
}

export function getLocationSeo(slug: string): LocationSeoBlock | null {
  return LOCATION_SEO_PAGES[slug as LocationSeoSlug] ?? null;
}

/**
 * Map legacy `/cape-town/cleaning-services/{area}` short slugs (e.g. `claremont`, `sea-point`)
 * to canonical `/locations/*` paths from `location-hubs.json` only (never synthesise slugs).
 * Unknown areas → `null` (callers fall back to legacy duplicate URLs or skip links).
 */
export function locationSeoPathFromLegacyAreaSlug(areaSlug: string): string | null {
  const path = locationHubPathFromAreaInput(areaSlug);
  return path === "/locations" ? null : path;
}

export function buildCapeTownServiceMetadata(data: CapeTownServiceSeoBlock): Metadata {
  const url = absoluteCanonicalUrl(data.path);
  const metaDescription = buildServicePageMetaDescription(data);
  /** CTR test: lead with city cleaning intent + price + action (replaces rotated template for this slug only). */
  const title =
    data.slug === "standard-cleaning-cape-town"
      ? clipSerpTitle("Cleaning Services Cape Town from R250 | Book Today | Shalean")
      : generateCtrTitle({
          base: serviceTitleBaseForCtr(data.bookingLabel, data.slug),
          place: "Cape Town",
          fromPrice: leadPriceForServiceSlug(data.slug),
          templateKey: data.slug,
          brandSuffix: "Shalean",
          pageIntent: "service",
        });
  return {
    title,
    description: metaDescription,
    robots: SEO_INDEX_FOLLOW,
    ...(data.keywords?.length ? { keywords: data.keywords } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description: metaDescription,
      images: [{ url: data.ogImage, alt: data.h1 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: metaDescription,
      images: [data.ogImage],
    },
  };
}

function bookingLabelToServicePhrase(label: string): string {
  const t = label.trim();
  if (!t) return "Cleaning services";
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  if (/\bservice\b/i.test(cap)) return cap;
  return `${cap} service`;
}

function serviceSolutionVariant(bookingLabel: string): string {
  const t = bookingLabel.trim().toLowerCase();
  const phrase = t ? `${t} for homes and apartments` : "Professional cleaning for homes and apartments";
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function buildServicePageMetaDescription(data: CapeTownServiceSeoBlock): string {
  if (data.slug === "standard-cleaning-cape-town") {
    return clampMetaDescription(
      "Book trusted cleaners in Cape Town. From R250, same-day availability, vetted professionals. Get a quote in 60 seconds.",
    );
  }
  return generateMetaDescription({
    service: bookingLabelToServicePhrase(data.bookingLabel),
    location: "Cape Town",
    variant: serviceSolutionVariant(data.bookingLabel),
    templateKey: data.slug,
  });
}

export function buildLocationSeoMetadata(data: LocationSeoBlock, row: CapeTownLocationRow): Metadata {
  const url = absoluteCanonicalUrl(data.path);
  const { title: metaTitle, description: metaDescription } = resolveLocationSeoMetaFields(data, row);
  return {
    title: metaTitle,
    description: metaDescription,
    robots: SEO_INDEX_FOLLOW,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: metaTitle,
      description: metaDescription,
      images: [{ url: data.ogImage, alt: data.h1 }],
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDescription,
      images: [data.ogImage],
    },
  };
}

export async function buildLocationSeoMetadataAsync(data: LocationSeoBlock, row: CapeTownLocationRow): Promise<Metadata> {
  const url = absoluteCanonicalUrl(data.path);
  const { title: metaTitle, description: metaDescription } = await resolveLocationSeoMetaFieldsAsync(data, row);
  return {
    title: metaTitle,
    description: metaDescription,
    robots: SEO_INDEX_FOLLOW,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: metaTitle,
      description: metaDescription,
      images: [{ url: data.ogImage, alt: data.h1 }],
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDescription,
      images: [data.ogImage],
    },
  };
}

export function locationPageServiceLinks(): { href: string; label: string }[] {
  return [
    { href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path, label: "Deep cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path, label: "Standard cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path, label: "Office cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path, label: "Carpet cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["window-cleaning-cape-town"].path, label: "Window cleaning Cape Town" },
  ];
}

export function capeTownSeoLocationLinks(): { href: string; label: string }[] {
  return LOCATION_SEO_SLUGS.flatMap((locSlug) => {
    const block = LOCATION_SEO_PAGES[locSlug];
    const place = LOCATION_SEO_SHORT_PLACE[locSlug] ?? getProgrammaticLocation(locSlug)?.name;
    if (!block?.path || !place) return [];
    return [{ href: block.path, label: `Cleaning services in ${place}` }];
  });
}

let homepageInternalSeoLinksCache: { href: string; label: string }[] | undefined;

/** Screen-reader + crawler internal links from the marketing homepage (not visible). Lazy-built to avoid init-order issues with Turbopack. */
export function getHomepageInternalSeoLinks(): { href: string; label: string }[] {
  if (homepageInternalSeoLinksCache) return homepageInternalSeoLinksCache;
  homepageInternalSeoLinksCache = [
    { href: CAPE_TOWN_LOCATIONS_OVERVIEW_PATH, label: "Cape Town cleaning services hub" },
    { href: "/locations", label: "All suburb cleaning locations" },
    { href: "/cleaning-prices-cape-town", label: "Cleaning prices Cape Town" },
    { href: "/maid-services-cape-town", label: "Maid services Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path, label: "Deep cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path, label: "Standard cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path, label: "Office cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path, label: "Carpet cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["window-cleaning-cape-town"].path, label: "Window cleaning Cape Town" },
    ...capeTownSeoLocationLinks(),
  ];
  return homepageInternalSeoLinksCache;
}
