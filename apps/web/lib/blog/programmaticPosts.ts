import { CAPE_TOWN_SERVICE_SEO, type CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import { hubSlugFromPlaceName } from "@/lib/seo/location-hub-from-blog";
import type { BlogTocEntry } from "@/lib/blog/extract-blog-toc";
import { programmaticBlogCleanupRedirects } from "@/lib/seo/programmaticBlogCleanupRedirects";
import { BLOG_POST_SLUGS } from "./posts";

export type ProgrammaticGuideVariant =
  | "pricing"
  | "best_services"
  | "apartment_tips"
  | "cleaning_frequency"
  | "deep_checklist"
  | "move_out_cost";

export type ProgrammaticPost = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  primaryKeyword: string;
  location?: string;
  service: "deep" | "standard" | "airbnb" | "move-out" | "carpet" | "local-guide";
  /** Required when `service === "local-guide"` */
  guideVariant?: ProgrammaticGuideVariant;
  /** ISO 8601 for BlogPosting */
  publishedAt: string;
  dateModified?: string;
};

export const PROGRAMMATIC_LOCATION_NEARBY: Record<string, string[]> = {
  Claremont: ["Newlands", "Rondebosch", "Kenilworth", "Wynberg"],
  "Sea Point": ["Green Point", "Mouille Point", "Three Anchor Bay", "Bantry Bay"],
  Rondebosch: ["Claremont", "Newlands", "Rosebank", "Mowbray"],
  Gardens: ["City Bowl", "Tamboerskloof", "Oranjezicht", "Vredehoek"],
  Wynberg: ["Plumstead", "Kenilworth", "Constantia", "Bergvliet"],
  "Green Point": ["Sea Point", "Mouille Point", "City Bowl", "Waterfront"],
  Durbanville: ["Bellville", "Brackenfell", "Plattekloof", "Melkbosstrand"],
  Constantia: ["Wynberg", "Claremont", "Newlands", "Bergvliet"],
  Observatory: ["Rondebosch", "Woodstock", "Salt River", "Mowbray"],
  Newlands: ["Claremont", "Rondebosch", "Wynberg", "Kenilworth"],
};

const PROGRAMMATIC_PUBLISHED_AT = "2026-04-01T09:00:00+02:00";
const PROGRAMMATIC_DATE_MODIFIED = "2026-04-28T09:00:00+02:00";

const PROGRAMMATIC_POSTS_RAW: ProgrammaticPost[] = [
  // CLAREMONT
  {
    slug: "deep-cleaning-claremont-cape-town",
    title: "Deep Cleaning Services in Claremont, Cape Town",
    description:
      "Professional deep cleaning in Claremont, Cape Town for homes that need a thorough, top-to-bottom clean.",
    h1: "Deep Cleaning in Claremont, Cape Town",
    primaryKeyword: "deep cleaning Claremont Cape Town",
    location: "Claremont",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-claremont-cape-town",
    title: "Airbnb Cleaning Services in Claremont, Cape Town",
    description: "Reliable Airbnb cleaning in Claremont with fast turnovers and guest-ready results.",
    h1: "Airbnb Cleaning in Claremont, Cape Town",
    primaryKeyword: "airbnb cleaning Claremont Cape Town",
    location: "Claremont",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-claremont-cape-town",
    title: "Move-Out Cleaning in Claremont, Cape Town",
    description: "End of lease cleaning in Claremont to help you leave your property spotless and inspection-ready.",
    h1: "Move-Out Cleaning in Claremont, Cape Town",
    primaryKeyword: "move out cleaning Claremont Cape Town",
    location: "Claremont",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "home-cleaning-frequency-claremont-cape-town",
    title: "How Often Should You Book Home Cleaning in Claremont?",
    description:
      "Claremont cleaning cadence: school-term chaos, apartments near Main Road, and when to swap standard visits for deep cleans.",
    h1: "Home cleaning frequency in Claremont, Cape Town",
    primaryKeyword: "how often cleaning Claremont",
    location: "Claremont",
    service: "local-guide",
    guideVariant: "cleaning_frequency",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-checklist-claremont-cape-town",
    title: "Deep Cleaning Checklist for Claremont Homes & Apartments",
    description:
      "Room-by-room deep cleaning checklist for Claremont: kitchens after entertaining, bathrooms, and access notes for Harfield lanes.",
    h1: "Deep cleaning checklist for Claremont, Cape Town",
    primaryKeyword: "deep cleaning checklist Claremont",
    location: "Claremont",
    service: "local-guide",
    guideVariant: "deep_checklist",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-cost-claremont-cape-town",
    title: "Move-Out Cleaning Cost in Claremont (~Guide) | Quote Before You Pay",
    description:
      "Move-out cleaning cost in Claremont explained: inventory-led scope, ovens and fridges, and locking an upfront total before handover.",
    h1: "Move-out cleaning cost in Claremont, Cape Town",
    primaryKeyword: "move out cleaning cost Claremont",
    location: "Claremont",
    service: "local-guide",
    guideVariant: "move_out_cost",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "cleaning-prices-claremont-cape-town",
    title: "Cleaning Prices in Claremont, Cape Town (~R400+) | Planning Guide",
    description:
      "Claremont cleaning prices with illustrative bands for flats near Main Road and family homes—what shifts quotes and how to lock totals online.",
    h1: "Cleaning prices in Claremont, Cape Town",
    primaryKeyword: "cleaning prices Claremont",
    location: "Claremont",
    service: "local-guide",
    guideVariant: "pricing",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // SEA POINT
  {
    slug: "deep-cleaning-sea-point-cape-town",
    title: "Deep Cleaning Services in Sea Point, Cape Town",
    description: "Top-to-bottom deep cleaning in Sea Point for apartments and homes near the coast.",
    h1: "Deep Cleaning in Sea Point, Cape Town",
    primaryKeyword: "deep cleaning Sea Point Cape Town",
    location: "Sea Point",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-sea-point-cape-town",
    title: "Airbnb Cleaning Services in Sea Point, Cape Town",
    description: "Fast and reliable Airbnb cleaning in Sea Point for short-term rentals and hosts.",
    h1: "Airbnb Cleaning in Sea Point, Cape Town",
    primaryKeyword: "airbnb cleaning Sea Point Cape Town",
    location: "Sea Point",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-sea-point-cape-town",
    title: "Move-Out Cleaning in Sea Point, Cape Town",
    description: "Professional move-out cleaning in Sea Point for tenants and landlords.",
    h1: "Move-Out Cleaning in Sea Point, Cape Town",
    primaryKeyword: "move out cleaning Sea Point Cape Town",
    location: "Sea Point",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "cleaning-prices-sea-point-cape-town",
    title: "Cleaning Prices in Sea Point, Cape Town (~R450+) | Same-Week Guide",
    description:
      "Sea Point cleaning prices explained: typical apartment vs larger-home ranges, deep cleaning uplift, and how to lock an upfront quote online.",
    h1: "Cleaning prices in Sea Point, Cape Town",
    primaryKeyword: "cleaning prices Sea Point",
    location: "Sea Point",
    service: "local-guide",
    guideVariant: "pricing",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "apartment-cleaning-tips-sea-point-cape-town",
    title: "Apartment Cleaning Tips for Sea Point | Lift Access & Coastal Dust",
    description:
      "Practical apartment cleaning tips for Sea Point: coastal dust, lifts, short-stay turnovers, and scope notes that keep quotes accurate.",
    h1: "Apartment cleaning tips for Sea Point, Cape Town",
    primaryKeyword: "apartment cleaning tips Sea Point",
    location: "Sea Point",
    service: "local-guide",
    guideVariant: "apartment_tips",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "home-cleaning-frequency-sea-point-cape-town",
    title: "How Often Should You Book Home Cleaning in Sea Point?",
    description:
      "Sea Point cleaning frequency guide: weekly vs biweekly cycles, Airbnb turnovers, and when to step up to deep cleaning.",
    h1: "Home cleaning frequency in Sea Point, Cape Town",
    primaryKeyword: "how often cleaning Sea Point",
    location: "Sea Point",
    service: "local-guide",
    guideVariant: "cleaning_frequency",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-checklist-sea-point-cape-town",
    title: "Deep Cleaning Checklist for Sea Point Apartments & Homes",
    description:
      "Room-by-room deep cleaning checklist for Sea Point: kitchens, bathrooms, coastal dust zones, and what to flag at booking.",
    h1: "Deep cleaning checklist for Sea Point, Cape Town",
    primaryKeyword: "deep cleaning checklist Sea Point",
    location: "Sea Point",
    service: "local-guide",
    guideVariant: "deep_checklist",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-cost-sea-point-cape-town",
    title: "Move-Out Cleaning Cost in Sea Point (~Guide) | Quote Before You Pay",
    description:
      "Move-out cleaning cost in Sea Point explained: deposit-focused scope, ovens and fridges, and how to lock an upfront total.",
    h1: "Move-out cleaning cost in Sea Point, Cape Town",
    primaryKeyword: "move out cleaning cost Sea Point",
    location: "Sea Point",
    service: "local-guide",
    guideVariant: "move_out_cost",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // RONDEBOSCH
  {
    slug: "deep-cleaning-rondebosch-cape-town",
    title: "Deep Cleaning Services in Rondebosch, Cape Town",
    description: "Detailed deep cleaning services in Rondebosch for homes needing extra care.",
    h1: "Deep Cleaning in Rondebosch, Cape Town",
    primaryKeyword: "deep cleaning Rondebosch Cape Town",
    location: "Rondebosch",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-rondebosch-cape-town",
    title: "Airbnb Cleaning Services in Rondebosch, Cape Town",
    description: "Reliable Airbnb cleaning in Rondebosch with consistent guest-ready results.",
    h1: "Airbnb Cleaning in Rondebosch, Cape Town",
    primaryKeyword: "airbnb cleaning Rondebosch Cape Town",
    location: "Rondebosch",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "home-cleaning-frequency-rondebosch-cape-town",
    title: "How Often Should You Book Home Cleaning in Rondebosch?",
    description:
      "Rondebosch cleaning frequency for UCT-adjacent flats, family houses on Main Road, and when deep cleans beat recurring standard visits.",
    h1: "Home cleaning frequency in Rondebosch, Cape Town",
    primaryKeyword: "how often cleaning Rondebosch",
    location: "Rondebosch",
    service: "local-guide",
    guideVariant: "cleaning_frequency",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-checklist-rondebosch-cape-town",
    title: "Deep Cleaning Checklist for Rondebosch Homes & Student Flats",
    description:
      "Deep cleaning checklist for Rondebosch: shared bathrooms, kitchen grease after busy weeks, and hospital-vicinity parking notes.",
    h1: "Deep cleaning checklist for Rondebosch, Cape Town",
    primaryKeyword: "deep cleaning checklist Rondebosch",
    location: "Rondebosch",
    service: "local-guide",
    guideVariant: "deep_checklist",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-cost-rondebosch-cape-town",
    title: "Move-Out Cleaning Cost in Rondebosch (~Guide) | Quote Before You Pay",
    description:
      "Move-out cleaning cost in Rondebosch for leases near campus and hospital corridors—scope ovens, cupboards, and access honestly.",
    h1: "Move-out cleaning cost in Rondebosch, Cape Town",
    primaryKeyword: "move out cleaning cost Rondebosch",
    location: "Rondebosch",
    service: "local-guide",
    guideVariant: "move_out_cost",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "cleaning-prices-rondebosch-cape-town",
    title: "Cleaning Prices in Rondebosch, Cape Town (~R400+) | Planning Guide",
    description:
      "Rondebosch cleaning prices for UCT-adjacent flats and family streets—illustrative ZAR bands, deposit-heavy move-outs, and locked online totals.",
    h1: "Cleaning prices in Rondebosch, Cape Town",
    primaryKeyword: "cleaning prices Rondebosch",
    location: "Rondebosch",
    service: "local-guide",
    guideVariant: "pricing",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // GARDENS
  {
    slug: "airbnb-cleaning-gardens-cape-town",
    title: "Airbnb Cleaning Services in Gardens, Cape Town",
    description: "Airbnb cleaning in Gardens with fast turnovers and reliable service.",
    h1: "Airbnb Cleaning in Gardens, Cape Town",
    primaryKeyword: "airbnb cleaning Gardens Cape Town",
    location: "Gardens",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-gardens-cape-town",
    title: "Move-Out Cleaning in Gardens, Cape Town",
    description: "Move-out cleaning in Gardens for tenants preparing for inspection.",
    h1: "Move-Out Cleaning in Gardens, Cape Town",
    primaryKeyword: "move out cleaning Gardens Cape Town",
    location: "Gardens",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "cleaning-prices-gardens-cape-town",
    title: "Cleaning Prices in Gardens, Cape Town (~R380+) | City Bowl Guide",
    description:
      "Gardens cleaning prices for walk-ups and Kloof-adjacent flats—stairs, parking, and how illustrative bands translate to locked quotes.",
    h1: "Cleaning prices in Gardens, Cape Town",
    primaryKeyword: "cleaning prices Gardens Cape Town",
    location: "Gardens",
    service: "local-guide",
    guideVariant: "pricing",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "home-cleaning-frequency-gardens-cape-town",
    title: "How Often Should You Book Home Cleaning in Gardens?",
    description:
      "Gardens cleaning cadence for heritage flats, festival-week dust, and when City Bowl access makes biweekly smarter than monthly catch-ups.",
    h1: "Home cleaning frequency in Gardens, Cape Town",
    primaryKeyword: "how often cleaning Gardens",
    location: "Gardens",
    service: "local-guide",
    guideVariant: "cleaning_frequency",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-checklist-gardens-cape-town",
    title: "Deep Cleaning Checklist for Gardens Walk-Ups & Flats",
    description:
      "Deep cleaning checklist tailored to Gardens: compact kitchens, stair access, balconies, and booking notes inspectors photograph.",
    h1: "Deep cleaning checklist for Gardens, Cape Town",
    primaryKeyword: "deep cleaning checklist Gardens",
    location: "Gardens",
    service: "local-guide",
    guideVariant: "deep_checklist",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-cost-gardens-cape-town",
    title: "Move-Out Cleaning Cost in Gardens (~Guide) | Quote Before You Pay",
    description:
      "Move-out cleaning cost in Gardens explained: inventory photography, stairwell access, and locking upfront totals before handover.",
    h1: "Move-out cleaning cost in Gardens, Cape Town",
    primaryKeyword: "move out cleaning cost Gardens",
    location: "Gardens",
    service: "local-guide",
    guideVariant: "move_out_cost",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // WYNBERG
  {
    slug: "deep-cleaning-wynberg-cape-town",
    title: "Deep Cleaning Services in Wynberg, Cape Town",
    description: "Deep cleaning services in Wynberg for homes and apartments.",
    h1: "Deep Cleaning in Wynberg, Cape Town",
    primaryKeyword: "deep cleaning Wynberg Cape Town",
    location: "Wynberg",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-wynberg-cape-town",
    title: "Airbnb Cleaning Services in Wynberg, Cape Town",
    description: "Airbnb cleaning in Wynberg with fast turnaround and consistent results.",
    h1: "Airbnb Cleaning in Wynberg, Cape Town",
    primaryKeyword: "airbnb cleaning Wynberg Cape Town",
    location: "Wynberg",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-wynberg-cape-town",
    title: "Move-Out Cleaning in Wynberg, Cape Town",
    description: "Move-out cleaning in Wynberg to help tenants leave properties spotless.",
    h1: "Move-Out Cleaning in Wynberg, Cape Town",
    primaryKeyword: "move out cleaning Wynberg Cape Town",
    location: "Wynberg",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // STANDARD + CARPET (Claremont, Sea Point, Rondebosch, Gardens, Wynberg hub)
  {
    slug: "standard-cleaning-claremont-cape-town",
    title: "Standard Cleaning Services in Claremont, Cape Town",
    description:
      "Reliable standard home cleaning in Claremont for weekly or once-off visits—kitchens, bathrooms, and floors.",
    h1: "Standard Cleaning in Claremont, Cape Town",
    primaryKeyword: "standard cleaning Claremont Cape Town",
    location: "Claremont",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "carpet-cleaning-claremont-cape-town",
    title: "Carpet Cleaning Services in Claremont, Cape Town",
    description: "Carpet and rug refresh in Claremont for high-traffic rooms—standalone or bundled with home cleaning.",
    h1: "Carpet Cleaning in Claremont, Cape Town",
    primaryKeyword: "carpet cleaning Claremont Cape Town",
    location: "Claremont",
    service: "carpet",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-sea-point-cape-town",
    title: "Standard Cleaning Services in Sea Point, Cape Town",
    description: "Standard home cleaning in Sea Point for apartments near the coast—consistent kitchens and bathrooms.",
    h1: "Standard Cleaning in Sea Point, Cape Town",
    primaryKeyword: "standard cleaning Sea Point Cape Town",
    location: "Sea Point",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "carpet-cleaning-sea-point-cape-town",
    title: "Carpet Cleaning Services in Sea Point, Cape Town",
    description: "Carpet cleaning in Sea Point for rugs and soft floors in compact Atlantic Seaboard homes.",
    h1: "Carpet Cleaning in Sea Point, Cape Town",
    primaryKeyword: "carpet cleaning Sea Point Cape Town",
    location: "Sea Point",
    service: "carpet",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-rondebosch-cape-town",
    title: "Standard Cleaning Services in Rondebosch, Cape Town",
    description: "Standard cleaning in Rondebosch for rentals, student lets, and family homes on a steady schedule.",
    h1: "Standard Cleaning in Rondebosch, Cape Town",
    primaryKeyword: "standard cleaning Rondebosch Cape Town",
    location: "Rondebosch",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "carpet-cleaning-rondebosch-cape-town",
    title: "Carpet Cleaning Services in Rondebosch, Cape Town",
    description: "Carpet and rug cleaning in Rondebosch for bedrooms and lounges with heavy foot traffic.",
    h1: "Carpet Cleaning in Rondebosch, Cape Town",
    primaryKeyword: "carpet cleaning Rondebosch Cape Town",
    location: "Rondebosch",
    service: "carpet",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-gardens-cape-town",
    title: "Standard Cleaning Services in Gardens, Cape Town",
    description: "Standard home cleaning in Gardens for City Bowl apartments and compact family homes.",
    h1: "Standard Cleaning in Gardens, Cape Town",
    primaryKeyword: "standard cleaning Gardens Cape Town",
    location: "Gardens",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "carpet-cleaning-gardens-cape-town",
    title: "Carpet Cleaning Services in Gardens, Cape Town",
    description: "Carpet cleaning in Gardens for rugs and carpeted rooms near the CBD.",
    h1: "Carpet Cleaning in Gardens, Cape Town",
    primaryKeyword: "carpet cleaning Gardens Cape Town",
    location: "Gardens",
    service: "carpet",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-wynberg-cape-town",
    title: "Standard Cleaning Services in Wynberg, Cape Town",
    description: "Standard cleaning in Wynberg for Southern Suburb homes that need dependable weekly upkeep.",
    h1: "Standard Cleaning in Wynberg, Cape Town",
    primaryKeyword: "standard cleaning Wynberg Cape Town",
    location: "Wynberg",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "carpet-cleaning-wynberg-cape-town",
    title: "Carpet Cleaning Services in Wynberg, Cape Town",
    description: "Carpet cleaning in Wynberg for family homes with pets, kids, and high-traffic soft floors.",
    h1: "Carpet Cleaning in Wynberg, Cape Town",
    primaryKeyword: "carpet cleaning Wynberg Cape Town",
    location: "Wynberg",
    service: "carpet",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // GREEN POINT
  {
    slug: "deep-cleaning-green-point-cape-town",
    title: "Deep Cleaning Services in Green Point, Cape Town",
    description: "Professional deep cleaning in Green Point for modern apartments.",
    h1: "Deep Cleaning in Green Point, Cape Town",
    primaryKeyword: "deep cleaning Green Point Cape Town",
    location: "Green Point",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-green-point-cape-town",
    title: "Airbnb Cleaning Services in Green Point, Cape Town",
    description: "Airbnb cleaning in Green Point for hosts and short-term rentals.",
    h1: "Airbnb Cleaning in Green Point, Cape Town",
    primaryKeyword: "airbnb cleaning Green Point Cape Town",
    location: "Green Point",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-green-point-cape-town",
    title: "Move-Out Cleaning in Green Point, Cape Town",
    description: "Move-out cleaning in Green Point for tenants and landlords.",
    h1: "Move-Out Cleaning in Green Point, Cape Town",
    primaryKeyword: "move out cleaning Green Point Cape Town",
    location: "Green Point",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "home-cleaning-frequency-green-point-cape-town",
    title: "How Often Should You Book Home Cleaning in Green Point?",
    description:
      "Green Point cleaning cadence for Seaboard apartments, Airbnb turnovers near Somerset Road, and seasonal deep resets.",
    h1: "Home cleaning frequency in Green Point, Cape Town",
    primaryKeyword: "how often cleaning Green Point",
    location: "Green Point",
    service: "local-guide",
    guideVariant: "cleaning_frequency",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-checklist-green-point-cape-town",
    title: "Deep Cleaning Checklist for Green Point Apartments",
    description:
      "Deep cleaning checklist for Green Point: stadium-event grit, compact kitchens, balconies, and Waterfront-adjacent access gates.",
    h1: "Deep cleaning checklist for Green Point, Cape Town",
    primaryKeyword: "deep cleaning checklist Green Point",
    location: "Green Point",
    service: "local-guide",
    guideVariant: "deep_checklist",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-cost-green-point-cape-town",
    title: "Move-Out Cleaning Cost in Green Point (~Guide) | Quote Before You Pay",
    description:
      "Move-out cleaning cost in Green Point explained: Seaboard deposit photography, appliance add-ons, and upfront totals before inspection.",
    h1: "Move-out cleaning cost in Green Point, Cape Town",
    primaryKeyword: "move out cleaning cost Green Point",
    location: "Green Point",
    service: "local-guide",
    guideVariant: "move_out_cost",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "cleaning-prices-green-point-cape-town",
    title: "Cleaning Prices in Green Point, Cape Town (~R450+) | Seaboard Guide",
    description:
      "Green Point cleaning prices for Somerset Road apartments and event-night routing—typical ZAR bands, deep uplift, and locked online totals.",
    h1: "Cleaning prices in Green Point, Cape Town",
    primaryKeyword: "cleaning prices Green Point",
    location: "Green Point",
    service: "local-guide",
    guideVariant: "pricing",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-green-point-cape-town",
    title: "Standard Cleaning Services in Green Point, Cape Town",
    description: "Standard home cleaning in Green Point for Seaboard apartments and busy households.",
    h1: "Standard Cleaning in Green Point, Cape Town",
    primaryKeyword: "standard cleaning Green Point Cape Town",
    location: "Green Point",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "carpet-cleaning-green-point-cape-town",
    title: "Carpet Cleaning Services in Green Point, Cape Town",
    description: "Carpet cleaning in Green Point for rugs and soft floors in Atlantic Seaboard apartments.",
    h1: "Carpet Cleaning in Green Point, Cape Town",
    primaryKeyword: "carpet cleaning Green Point Cape Town",
    location: "Green Point",
    service: "carpet",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // OBSERVATORY & NEWLANDS (scaled clusters)
  {
    slug: "deep-cleaning-observatory-cape-town",
    title: "Deep Cleaning Services in Observatory, Cape Town",
    description: "Deep cleaning for Observatory shares and compact flats—kitchens, bathrooms, and realistic crew time.",
    h1: "Deep Cleaning in Observatory, Cape Town",
    primaryKeyword: "deep cleaning Observatory Cape Town",
    location: "Observatory",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-observatory-cape-town",
    title: "Airbnb Cleaning Services in Observatory, Cape Town",
    description: "Fast Airbnb turnovers along Lower Main Road with guest-ready kitchens and bathrooms.",
    h1: "Airbnb Cleaning in Observatory, Cape Town",
    primaryKeyword: "airbnb cleaning Observatory Cape Town",
    location: "Observatory",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-observatory-cape-town",
    title: "Move-Out Cleaning in Observatory, Cape Town",
    description: "Move-out cleaning for Observatory rentals—inventory-focused wet areas and scoped add-ons.",
    h1: "Move-Out Cleaning in Observatory, Cape Town",
    primaryKeyword: "move out cleaning Observatory Cape Town",
    location: "Observatory",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-observatory-cape-town",
    title: "Standard Cleaning Services in Observatory, Cape Town",
    description: "Recurring standard cleaning for Observatory apartments and student-heavy layouts.",
    h1: "Standard Cleaning in Observatory, Cape Town",
    primaryKeyword: "standard cleaning Observatory Cape Town",
    location: "Observatory",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "cleaning-prices-observatory-cape-town",
    title: "Cleaning Prices in Observatory, Cape Town (~R400+) | Main Road Guide",
    description:
      "Observatory cleaning prices for compact flats and shares—what moves quotes near Main Road and how totals lock online.",
    h1: "Cleaning prices in Observatory, Cape Town",
    primaryKeyword: "cleaning prices Observatory",
    location: "Observatory",
    service: "local-guide",
    guideVariant: "pricing",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "home-cleaning-frequency-observatory-cape-town",
    title: "How Often Should You Book Home Cleaning in Observatory?",
    description:
      "Observatory cleaning frequency for high-turnover bathrooms, shared kitchens, and when deep resets beat stretching monthly visits.",
    h1: "Home cleaning frequency in Observatory, Cape Town",
    primaryKeyword: "how often cleaning Observatory",
    location: "Observatory",
    service: "local-guide",
    guideVariant: "cleaning_frequency",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-checklist-observatory-cape-town",
    title: "Deep Cleaning Checklist for Observatory Flats",
    description:
      "Room-by-room deep cleaning checklist for Observatory: shared bathrooms, stairwell access, and appliance add-ons.",
    h1: "Deep cleaning checklist for Observatory, Cape Town",
    primaryKeyword: "deep cleaning checklist Observatory",
    location: "Observatory",
    service: "local-guide",
    guideVariant: "deep_checklist",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-cost-observatory-cape-town",
    title: "Move-Out Cleaning Cost in Observatory (~Guide) | Quote Before You Pay",
    description:
      "Move-out cleaning cost in Observatory for inspection-ready handovers—cupboards, ovens, and upfront totals.",
    h1: "Move-out cleaning cost in Observatory, Cape Town",
    primaryKeyword: "move out cleaning cost Observatory",
    location: "Observatory",
    service: "local-guide",
    guideVariant: "move_out_cost",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-newlands-cape-town",
    title: "Deep Cleaning Services in Newlands, Cape Town",
    description: "Deep cleaning for Newlands family homes—kitchens, bathrooms, and tree-lined dust loads.",
    h1: "Deep Cleaning in Newlands, Cape Town",
    primaryKeyword: "deep cleaning Newlands Cape Town",
    location: "Newlands",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-newlands-cape-town",
    title: "Airbnb Cleaning Services in Newlands, Cape Town",
    description: "Guest-ready Airbnb cleaning in Newlands village-adjacent streets.",
    h1: "Airbnb Cleaning in Newlands, Cape Town",
    primaryKeyword: "airbnb cleaning Newlands Cape Town",
    location: "Newlands",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-newlands-cape-town",
    title: "Move-Out Cleaning in Newlands, Cape Town",
    description: "Move-out cleaning for Newlands houses and duplexes ahead of inspections.",
    h1: "Move-Out Cleaning in Newlands, Cape Town",
    primaryKeyword: "move out cleaning Newlands Cape Town",
    location: "Newlands",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-newlands-cape-town",
    title: "Standard Cleaning Services in Newlands, Cape Town",
    description: "Standard home cleaning between canopy dust seasons and busy school calendars.",
    h1: "Standard Cleaning in Newlands, Cape Town",
    primaryKeyword: "standard cleaning Newlands Cape Town",
    location: "Newlands",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "cleaning-prices-newlands-cape-town",
    title: "Cleaning Prices in Newlands, Cape Town (~R400+) | Village Guide",
    description:
      "Newlands cleaning prices for cottages and family homes—leaf litter load, bathrooms, and illustrative planning bands.",
    h1: "Cleaning prices in Newlands, Cape Town",
    primaryKeyword: "cleaning prices Newlands",
    location: "Newlands",
    service: "local-guide",
    guideVariant: "pricing",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "home-cleaning-frequency-newlands-cape-town",
    title: "How Often Should You Book Home Cleaning in Newlands?",
    description:
      "Newlands cleaning cadence around tree pollen, winter mud, and when deep cleans refresh kitchens between sports seasons.",
    h1: "Home cleaning frequency in Newlands, Cape Town",
    primaryKeyword: "how often cleaning Newlands",
    location: "Newlands",
    service: "local-guide",
    guideVariant: "cleaning_frequency",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-checklist-newlands-cape-town",
    title: "Deep Cleaning Checklist for Newlands Homes",
    description:
      "Deep cleaning checklist for Newlands: multi-level houses, outdoor mud lanes, and ovens before entertaining weekends.",
    h1: "Deep cleaning checklist for Newlands, Cape Town",
    primaryKeyword: "deep cleaning checklist Newlands",
    location: "Newlands",
    service: "local-guide",
    guideVariant: "deep_checklist",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-cost-newlands-cape-town",
    title: "Move-Out Cleaning Cost in Newlands (~Guide) | Quote Before You Pay",
    description:
      "Move-out cleaning cost in Newlands with inventory-grade scope—fridges, cupboards, and realistic crew hours.",
    h1: "Move-out cleaning cost in Newlands, Cape Town",
    primaryKeyword: "move out cleaning cost Newlands",
    location: "Newlands",
    service: "local-guide",
    guideVariant: "move_out_cost",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // DURBANVILLE
  {
    slug: "deep-cleaning-durbanville-cape-town",
    title: "Deep Cleaning Services in Durbanville, Cape Town",
    description: "Deep cleaning in Durbanville for family homes and large properties.",
    h1: "Deep Cleaning in Durbanville, Cape Town",
    primaryKeyword: "deep cleaning Durbanville Cape Town",
    location: "Durbanville",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-durbanville-cape-town",
    title: "Airbnb Cleaning Services in Durbanville, Cape Town",
    description: "Reliable Airbnb cleaning in Durbanville for short-term rentals.",
    h1: "Airbnb Cleaning in Durbanville, Cape Town",
    primaryKeyword: "airbnb cleaning Durbanville Cape Town",
    location: "Durbanville",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-durbanville-cape-town",
    title: "Move-Out Cleaning in Durbanville, Cape Town",
    description: "Move-out cleaning in Durbanville for tenants preparing to move.",
    h1: "Move-Out Cleaning in Durbanville, Cape Town",
    primaryKeyword: "move out cleaning Durbanville Cape Town",
    location: "Durbanville",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-durbanville-cape-town",
    title: "Standard Cleaning Services in Durbanville, Cape Town",
    description: "Standard cleaning in Durbanville for family homes and multi-bathroom layouts.",
    h1: "Standard Cleaning in Durbanville, Cape Town",
    primaryKeyword: "standard cleaning Durbanville Cape Town",
    location: "Durbanville",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "carpet-cleaning-durbanville-cape-town",
    title: "Carpet Cleaning Services in Durbanville, Cape Town",
    description: "Carpet cleaning in Durbanville for high-traffic family homes and rentals.",
    h1: "Carpet Cleaning in Durbanville, Cape Town",
    primaryKeyword: "carpet cleaning Durbanville Cape Town",
    location: "Durbanville",
    service: "carpet",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "cleaning-prices-durbanville-cape-town",
    title: "Cleaning Prices in Durbanville, Cape Town (~R380+) | Northern Suburbs Guide",
    description:
      "Durbanville cleaning prices for estates and family houses—larger footprints, security gates, and illustrative ZAR bands.",
    h1: "Cleaning prices in Durbanville, Cape Town",
    primaryKeyword: "cleaning prices Durbanville",
    location: "Durbanville",
    service: "local-guide",
    guideVariant: "pricing",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "home-cleaning-frequency-durbanville-cape-town",
    title: "How Often Should You Book Home Cleaning in Durbanville?",
    description:
      "Durbanville cleaning cadence for double-volume homes, pets, and when northern winds dust patios faster than inland suburbs.",
    h1: "Home cleaning frequency in Durbanville, Cape Town",
    primaryKeyword: "how often cleaning Durbanville",
    location: "Durbanville",
    service: "local-guide",
    guideVariant: "cleaning_frequency",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "deep-cleaning-checklist-durbanville-cape-town",
    title: "Deep Cleaning Checklist for Durbanville Houses",
    description:
      "Deep cleaning checklist for Durbanville: multi-bathroom homes, estate access, and appliance add-ons worth itemising.",
    h1: "Deep cleaning checklist for Durbanville, Cape Town",
    primaryKeyword: "deep cleaning checklist Durbanville",
    location: "Durbanville",
    service: "local-guide",
    guideVariant: "deep_checklist",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-cost-durbanville-cape-town",
    title: "Move-Out Cleaning Cost in Durbanville (~Guide) | Quote Before You Pay",
    description:
      "Move-out cleaning cost in Durbanville for larger layouts—deposit photography, ovens, and upfront totals before inspection.",
    h1: "Move-out cleaning cost in Durbanville, Cape Town",
    primaryKeyword: "move out cleaning cost Durbanville",
    location: "Durbanville",
    service: "local-guide",
    guideVariant: "move_out_cost",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // CONSTANTIA
  {
    slug: "deep-cleaning-constantia-cape-town",
    title: "Deep Cleaning Services in Constantia, Cape Town",
    description:
      "Deep cleaning in Constantia for larger homes, estates, and kitchens that need extended dwell time.",
    h1: "Deep Cleaning in Constantia, Cape Town",
    primaryKeyword: "deep cleaning Constantia Cape Town",
    location: "Constantia",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "airbnb-cleaning-constantia-cape-town",
    title: "Airbnb Cleaning Services in Constantia, Cape Town",
    description: "Guest-ready Airbnb cleaning in Constantia with turnover-focused checklists.",
    h1: "Airbnb Cleaning in Constantia, Cape Town",
    primaryKeyword: "airbnb cleaning Constantia Cape Town",
    location: "Constantia",
    service: "airbnb",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "move-out-cleaning-constantia-cape-town",
    title: "Move-Out Cleaning in Constantia, Cape Town",
    description: "Inspection-led move-out cleaning in Constantia for large layouts and rental handovers.",
    h1: "Move-Out Cleaning in Constantia, Cape Town",
    primaryKeyword: "move out cleaning Constantia Cape Town",
    location: "Constantia",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "standard-cleaning-constantia-cape-town",
    title: "Standard Cleaning Services in Constantia, Cape Town",
    description: "Recurring standard cleaning in Constantia for family homes between deeper resets.",
    h1: "Standard Cleaning in Constantia, Cape Town",
    primaryKeyword: "standard cleaning Constantia Cape Town",
    location: "Constantia",
    service: "standard",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
  {
    slug: "carpet-cleaning-constantia-cape-town",
    title: "Carpet Cleaning Services in Constantia, Cape Town",
    description: "Carpet cleaning in Constantia for high-traffic lanes and estate-sized living zones.",
    h1: "Carpet Cleaning in Constantia, Cape Town",
    primaryKeyword: "carpet cleaning Constantia Cape Town",
    location: "Constantia",
    service: "carpet",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
];

function normalizeRedirectPath(path: string): string {
  const p = path.trim().split(/[?#]/)[0] ?? "";
  if (!p || p === "/") return "/";
  return p.replace(/\/+$/, "") || "/";
}

function blogSlugFromResolvedPath(path: string): string | null {
  const n = normalizeRedirectPath(path);
  if (!n.startsWith("/blog/")) return null;
  const slug = n.slice("/blog/".length);
  return slug.length > 0 ? slug : null;
}

const PROGRAMMATIC_REDIRECT_MAP: ReadonlyMap<string, string> = new Map(
  programmaticBlogCleanupRedirects.map((r) => {
    const src = normalizeRedirectPath(r.source);
    const rawDest = r.destination.split(/[?#]/)[0] ?? r.destination;
    const dest = rawDest.startsWith("/") ? normalizeRedirectPath(rawDest) : rawDest;
    return [src, dest] as const;
  }),
);

function resolveProgrammaticRedirectChain(path: string, maxHops = 16): string {
  let current = normalizeRedirectPath(path.split(/[?#]/)[0] ?? path);
  const visited = new Set<string>();
  for (let i = 0; i < maxHops; i++) {
    if (visited.has(current)) return current;
    visited.add(current);
    const next = PROGRAMMATIC_REDIRECT_MAP.get(current);
    if (!next) return current;
    current = next.startsWith("/") ? normalizeRedirectPath(next.split(/[?#]/)[0] ?? next) : next;
  }
  return current;
}

/**
 * Collapse redirect-alias programmatic rows onto canonical `/blog/*` targets so static pools
 * no longer double-count REDIRECT_ALIAS ownership in governance reports.
 */
function finalizeProgrammaticPostsForCanonicalPools(raw: ProgrammaticPost[]): ProgrammaticPost[] {
  const map = new Map<string, ProgrammaticPost>();
  for (const p of raw) {
    const s = p.slug.trim().toLowerCase();
    const resolved = resolveProgrammaticRedirectChain(`/blog/${s}`);
    if (!resolved.startsWith("/blog")) continue;
    const canon = blogSlugFromResolvedPath(resolved) ?? s;
    const next = { ...p, slug: canon };
    const existing = map.get(canon);
    if (!existing) {
      map.set(canon, next);
      continue;
    }
    const rank = (x: ProgrammaticPost) =>
      x.service === "local-guide" ? 4 : x.description.length > 160 ? 3 : x.primaryKeyword.length > 35 ? 2 : 1;
    map.set(canon, rank(next) >= rank(existing) ? next : existing);
  }
  return [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Programmatic spine after redirect-alias canonicalization (unique slug → one row per canonical URL). */
export const PROGRAMMATIC_POSTS: ProgrammaticPost[] = finalizeProgrammaticPostsForCanonicalPools(PROGRAMMATIC_POSTS_RAW);

const SLUG_SET = new Set(PROGRAMMATIC_POSTS.map((p) => p.slug));

for (const s of BLOG_POST_SLUGS) {
  if (SLUG_SET.has(s)) {
    throw new Error(`Programmatic slug collides with editorial blog slug: ${s}`);
  }
}

/** `sea-point-cleaning-services` → `sea-point` for programmatic `/blog/*-{area}-cape-town` slugs. */
export function hubAreaKebabFromHubSlug(hubSlug: string): string {
  return hubSlug.replace(/-cleaning-services$/, "");
}

export function programmaticBlogHrefIfExists(slug: string): string | null {
  return PROGRAMMATIC_POSTS.some((p) => p.slug === slug) ? `/blog/${slug}` : null;
}

function editorialClusterLinkLabel(slug: string, areaName: string): string {
  if (slug.startsWith("cleaning-services-") && slug.endsWith("-cape-town")) {
    return `Cleaning services in ${areaName}`;
  }
  if (slug.includes("home-cleaning-frequency")) return `Home cleaning frequency in ${areaName}`;
  if (slug.includes("deep-cleaning-checklist")) return `Deep cleaning checklist in ${areaName}`;
  if (slug.includes("move-out-cleaning-cost")) return `Move-out cleaning cost in ${areaName}`;
  if (slug.includes("cleaning-prices")) return `Cleaning prices in ${areaName}`;
  if (slug.includes("best-cleaning-services")) return `Choosing cleaners in ${areaName}`;
  if (slug.includes("apartment-cleaning-tips")) return `Apartment cleaning tips (${areaName})`;
  const post = PROGRAMMATIC_POSTS.find((p) => p.slug === slug);
  return post?.title ?? slug;
}

/** Four editorial guides (pricing, frequency, checklist, move-out cost) — primary programmatic spine per suburb. */
export function getHubEditorialGuideLinks(hubSlug: string, areaName: string): { href: string; label: string }[] {
  const base = hubAreaKebabFromHubSlug(hubSlug);
  const slugs = new Set(PROGRAMMATIC_POSTS.map((p) => p.slug));
  const pack = [
    `cleaning-prices-${base}-cape-town`,
    `home-cleaning-frequency-${base}-cape-town`,
    `deep-cleaning-checklist-${base}-cape-town`,
    `move-out-cleaning-cost-${base}-cape-town`,
  ].filter((s) => slugs.has(s));
  return pack.map((s) => ({ href: `/blog/${s}`, label: editorialClusterLinkLabel(s, areaName) }));
}

/** Guides plus area service-intent blogs (deep / move-out / standard) when published. */
export function getEditorialClusterBlogLinksForHub(
  hubSlug: string,
  areaName: string,
): { href: string; label: string }[] {
  const guides = getHubEditorialGuideLinks(hubSlug, areaName);
  const base = hubAreaKebabFromHubSlug(hubSlug);
  const slugs = new Set(PROGRAMMATIC_POSTS.map((p) => p.slug));
  const hubCanon = `cleaning-services-${base}-cape-town`;
  const extraLinks: { href: string; label: string }[] = [];
  if (slugs.has(hubCanon)) {
    extraLinks.push({ href: `/blog/${hubCanon}`, label: editorialClusterLinkLabel(hubCanon, areaName) });
  }
  return [...guides, ...extraLinks];
}

export type LocalGuideEditorialCrossLinks = {
  hubHref: string;
  relatedBlogs: { href: string; label: string }[];
  serviceHref: string;
  serviceLabel: string;
};

function serviceLinkForGuideVariant(
  variant: ProgrammaticGuideVariant | undefined,
): { href: string; label: string } {
  const standard = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
  const deep = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const moveOut = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const airbnb = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;
  switch (variant) {
    case "pricing":
      return { href: deep, label: "deep cleaning service guide" };
    case "deep_checklist":
      return { href: deep, label: "deep cleaning service guide" };
    case "move_out_cost":
      return { href: moveOut, label: "move-out cleaning service guide" };
    case "cleaning_frequency":
      return { href: standard, label: "standard cleaning service guide" };
    case "apartment_tips":
      return { href: airbnb, label: "Airbnb cleaning service guide" };
    case "best_services":
      return { href: deep, label: "deep cleaning service guide" };
    default:
      return { href: standard, label: "standard cleaning service guide" };
  }
}

/** Two related cluster blogs + one Cape Town service page + hub — for local-guide templates. */
export function getLocalGuideEditorialCrossLinks(post: ProgrammaticPost): LocalGuideEditorialCrossLinks | null {
  if (post.service !== "local-guide" || !post.location) return null;
  const areaName = post.location;
  const hubSlug = hubSlugFromPlaceName(areaName);
  if (!hubSlug) return null;
  const base = hubAreaKebabFromHubSlug(hubSlug);
  const slugs = new Set(PROGRAMMATIC_POSTS.map((p) => p.slug));
  const clusterSlugs = [
    `cleaning-prices-${base}-cape-town`,
    `home-cleaning-frequency-${base}-cape-town`,
    `deep-cleaning-checklist-${base}-cape-town`,
    `move-out-cleaning-cost-${base}-cape-town`,
    `apartment-cleaning-tips-${base}-cape-town`,
  ].filter((s) => slugs.has(s) && s !== post.slug);

  const relatedBlogs = clusterSlugs.slice(0, 2).map((s) => ({
    href: `/blog/${s}`,
    label: editorialClusterLinkLabel(s, areaName),
  }));

  const { href: serviceHref, label: serviceLabel } = serviceLinkForGuideVariant(post.guideVariant);

  return {
    hubHref: `/locations/${hubSlug}`,
    relatedBlogs,
    serviceHref,
    serviceLabel,
  };
}

/** Set `NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES=false` after migrating programmatic URLs to `blog_posts`. */
export const LEGACY_PROGRAMMATIC_ROUTES_ENABLED =
  typeof process.env.NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES === "undefined" ||
  process.env.NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES !== "false";

/** Posts still rendered from in-repo definitions (routing + static params). */
export const ROUTED_PROGRAMMATIC_POSTS: ProgrammaticPost[] = LEGACY_PROGRAMMATIC_ROUTES_ENABLED
  ? PROGRAMMATIC_POSTS
  : [];

export function getProgrammaticPost(slug: string): ProgrammaticPost | null {
  return ROUTED_PROGRAMMATIC_POSTS.find((p) => p.slug === slug) ?? null;
}

const AREA_BLOG_HUB_LOCATIONS = [
  "Claremont",
  "Sea Point",
  "Rondebosch",
  "Gardens",
  "Wynberg",
  "Green Point",
  "Durbanville",
  "Constantia",
] as const;

type ProgrammaticServiceForAreaHub = Exclude<ProgrammaticPost["service"], "local-guide">;

const CAPE_TOWN_SERVICE_SLUG_TO_PROGRAMMATIC_SERVICE: Record<
  CapeTownSeoServiceSlug,
  ProgrammaticServiceForAreaHub | null
> = {
  "deep-cleaning-cape-town": "deep",
  "standard-cleaning-cape-town": "standard",
  "move-out-cleaning-cape-town": "move-out",
  "office-cleaning-cape-town": null,
  "airbnb-cleaning-cape-town": "airbnb",
  "carpet-cleaning-cape-town": "carpet",
  "window-cleaning-cape-town": null,
};

const AREA_HUB_LINK_LABEL_PHRASE: Record<ProgrammaticServiceForAreaHub, string> = {
  deep: "Deep cleaning",
  standard: "Standard cleaning",
  airbnb: "Airbnb cleaning",
  "move-out": "Move-out cleaning",
  carpet: "Carpet cleaning",
};

/** Editorial `blog_posts` rows that supersede thin PROGRAMMATIC_POSTS URLs for a given service × area. */
const EDITORIAL_SERVICE_AREA_BLOG_SLUG: Partial<
  Record<ProgrammaticServiceForAreaHub, Partial<Record<(typeof AREA_BLOG_HUB_LOCATIONS)[number], string>>>
> = {
  deep: {
    Gardens: "deep-cleaning-gardens-cape-town",
  },
  standard: {
    Wynberg: "regular-home-cleaning-wynberg-cape-town",
    Constantia: "home-cleaning-constantia-cape-town",
  },
  "move-out": {
    Rondebosch: "cleaning-services-rondebosch-cape-town",
  },
};

/** Internal links from Cape Town service SEO pages to matching programmatic /blog/* area posts. */
export function getAreaProgrammaticBlogLinksForCapeTownService(
  slug: CapeTownSeoServiceSlug,
): { href: string; label: string }[] | null {
  const svc = CAPE_TOWN_SERVICE_SLUG_TO_PROGRAMMATIC_SERVICE[slug];
  if (!svc) return null;
  const phrase = AREA_HUB_LINK_LABEL_PHRASE[svc];
  return AREA_BLOG_HUB_LOCATIONS.map((loc) => {
    const editorialSlug = EDITORIAL_SERVICE_AREA_BLOG_SLUG[svc]?.[loc];
    if (editorialSlug) {
      return { href: `/blog/${editorialSlug}`, label: `${phrase} in ${loc}` };
    }
    const post = PROGRAMMATIC_POSTS.find((p) => p.service === svc && p.location === loc);
    if (post) {
      return { href: `/blog/${post.slug}`, label: `${phrase} in ${loc}` };
    }
    const hubKey = hubSlugFromPlaceName(loc);
    if (hubKey) {
      const base = hubAreaKebabFromHubSlug(hubKey);
      const hubCanon = `cleaning-services-${base}-cape-town`;
      const hubHit = PROGRAMMATIC_POSTS.find((p) => p.slug === hubCanon);
      if (hubHit) {
        return { href: `/blog/${hubCanon}`, label: `${phrase} in ${loc}` };
      }
    }
    throw new Error(`Missing programmatic post for service "${svc}" in ${loc}`);
  });
}

export function getNearbySuburbsForProgrammaticPost(location: string | undefined): string[] {
  if (!location) return ["Sea Point", "Claremont", "Rondebosch", "Gardens", "Wynberg"];
  return PROGRAMMATIC_LOCATION_NEARBY[location] ?? [];
}

export function programmaticServiceLabel(post: ProgrammaticPost): string {
  if (post.service === "local-guide") {
    switch (post.guideVariant) {
      case "pricing":
        return "cleaning prices";
      case "best_services":
        return "cleaning service choices";
      case "apartment_tips":
        return "apartment cleaning";
      case "cleaning_frequency":
        return "home cleaning frequency";
      case "deep_checklist":
        return "deep cleaning checklist";
      case "move_out_cost":
        return "move-out cleaning cost";
      default:
        return "cleaning guide";
    }
  }
  switch (post.service) {
    case "deep":
      return "deep cleaning";
    case "standard":
      return "standard cleaning";
    case "airbnb":
      return "Airbnb turnover cleaning";
    case "move-out":
      return "move-out cleaning";
    case "carpet":
      return "carpet cleaning";
  }
}

const PROGRAMMATIC_SERVICE_SEO_SLUG: Record<
  Exclude<ProgrammaticPost["service"], "local-guide">,
  CapeTownSeoServiceSlug
> = {
  deep: "deep-cleaning-cape-town",
  standard: "standard-cleaning-cape-town",
  airbnb: "airbnb-cleaning-cape-town",
  "move-out": "move-out-cleaning-cape-town",
  carpet: "carpet-cleaning-cape-town",
};

/** Area service posts → suburb hub + two guide blogs + matching Cape Town service page. */
export function getServiceProgrammaticCrossLinks(post: ProgrammaticPost): {
  hubHref: string;
  relatedBlogs: { href: string; label: string }[];
  primaryServiceHref: string;
  primaryServiceLabel: string;
} | null {
  if (post.service === "local-guide" || !post.location) return null;
  const hubSlug = hubSlugFromPlaceName(post.location);
  if (!hubSlug) return null;
  const relatedBlogs = getHubEditorialGuideLinks(hubSlug, post.location).slice(0, 2);
  const seoSlug = PROGRAMMATIC_SERVICE_SEO_SLUG[post.service];
  const primaryServiceHref = CAPE_TOWN_SERVICE_SEO[seoSlug].path;
  const primaryServiceLabel = `${programmaticServiceLabel(post)} — Cape Town service scope`;
  return {
    hubHref: `/locations/${hubSlug}`,
    relatedBlogs,
    primaryServiceHref,
    primaryServiceLabel,
  };
}

/** Headings for `local-guide` programmatic posts — keep in sync with `LocalGuideProgrammaticTemplate`. */
export const LOCAL_GUIDE_DOC_ANCHOR_IDS = {
  overview: "loc-guide-overview",
  pricingDrivers: "loc-guide-pricing-drivers",
  picking: "loc-guide-picking",
  trust: "loc-guide-trust",
  book: "loc-guide-book",
  nearby: "loc-guide-nearby",
  faq: "prog-faq",
} as const;

/** DOM ids for in-page navigation — keep in sync with `ProgrammaticBlogTemplate` headings. */
export const PROGRAMMATIC_DOC_ANCHOR_IDS = {
  whatIs: "prog-what-is",
  whenToBook: "prog-when-book",
  seasonalSub: "prog-seasonal-subheading",
  whyPro: "prog-why-pro",
  sameDay: "prog-same-day",
  nearby: "prog-nearby",
  faq: "prog-faq",
} as const;

export function buildProgrammaticWhatIsHeading(post: ProgrammaticPost): string {
  const loc = post.location ?? "Cape Town";
  if (post.service === "local-guide") {
    switch (post.guideVariant) {
      case "pricing":
        return `How cleaning prices work in ${loc}`;
      case "best_services":
        return `How to choose cleaning services in ${loc}`;
      case "apartment_tips":
        return `Apartment cleaning checklist for ${loc}`;
      case "cleaning_frequency":
        return `How often to book home cleaning in ${loc}`;
      case "deep_checklist":
        return `Deep cleaning checklist for ${loc}`;
      case "move_out_cost":
        return `Move-out cleaning cost in ${loc}`;
      default:
        return `Cleaning guide for ${loc}`;
    }
  }
  const phrase: Record<Exclude<ProgrammaticPost["service"], "local-guide">, string> = {
    deep: "deep cleaning",
    standard: "standard cleaning",
    airbnb: "Airbnb cleaning",
    "move-out": "move-out cleaning",
    carpet: "carpet cleaning",
  };
  return `What is ${phrase[post.service]} in ${loc}?`;
}

export function getProgrammaticTableOfContents(post: ProgrammaticPost): BlogTocEntry[] {
  const loc = post.location ?? "Cape Town";
  if (post.service === "local-guide") {
    const v = post.guideVariant;
    const base = [
      { id: LOCAL_GUIDE_DOC_ANCHOR_IDS.overview, label: buildProgrammaticWhatIsHeading(post), level: 2 as const },
      { id: LOCAL_GUIDE_DOC_ANCHOR_IDS.trust, label: `Trust signals & what to avoid in ${loc}`, level: 2 as const },
      { id: LOCAL_GUIDE_DOC_ANCHOR_IDS.book, label: `Book with locked pricing (${loc})`, level: 2 as const },
      { id: LOCAL_GUIDE_DOC_ANCHOR_IDS.nearby, label: `Nearby areas & suburb hub`, level: 2 as const },
      { id: LOCAL_GUIDE_DOC_ANCHOR_IDS.faq, label: "Frequently asked questions", level: 2 as const },
    ];
    if (v === "pricing") {
      return [
        base[0]!,
        { id: LOCAL_GUIDE_DOC_ANCHOR_IDS.pricingDrivers, label: `What moves quotes in ${loc}`, level: 2 },
        ...base.slice(1),
      ];
    }
    if (v === "best_services") {
      return [
        base[0]!,
        { id: LOCAL_GUIDE_DOC_ANCHOR_IDS.picking, label: `Picking the right service tier in ${loc}`, level: 2 },
        ...base.slice(1),
      ];
    }
    if (v === "cleaning_frequency") {
      return [
        base[0]!,
        { id: LOCAL_GUIDE_DOC_ANCHOR_IDS.pricingDrivers, label: `Cleaning frequency for ${loc} households`, level: 2 },
        ...base.slice(1),
      ];
    }
    if (v === "deep_checklist") {
      return [
        base[0]!,
        {
          id: LOCAL_GUIDE_DOC_ANCHOR_IDS.pricingDrivers,
          label: `Room-by-room checklist for ${loc}`,
          level: 2,
        },
        ...base.slice(1),
      ];
    }
    if (v === "move_out_cost") {
      return [
        base[0]!,
        {
          id: LOCAL_GUIDE_DOC_ANCHOR_IDS.pricingDrivers,
          label: `What drives move-out cleaning cost in ${loc}`,
          level: 2,
        },
        ...base.slice(1),
      ];
    }
    return [
      base[0]!,
      {
        id: LOCAL_GUIDE_DOC_ANCHOR_IDS.pricingDrivers,
        label: `Coastal dust, lifts & compact kitchens in ${loc}`,
        level: 2,
      },
      ...base.slice(1),
    ];
  }

  const svc = programmaticServiceLabel(post);
  return [
    { id: PROGRAMMATIC_DOC_ANCHOR_IDS.whatIs, label: buildProgrammaticWhatIsHeading(post), level: 2 },
    { id: PROGRAMMATIC_DOC_ANCHOR_IDS.whenToBook, label: `When to book ${svc} in ${loc}`, level: 2 },
    {
      id: PROGRAMMATIC_DOC_ANCHOR_IDS.seasonalSub,
      label: "Seasonal demand & inspection windows",
      level: 3,
    },
    { id: PROGRAMMATIC_DOC_ANCHOR_IDS.whyPro, label: "Why hire professional cleaners in Cape Town", level: 2 },
    { id: PROGRAMMATIC_DOC_ANCHOR_IDS.sameDay, label: `Same-day cleaning availability in ${loc}`, level: 2 },
    { id: PROGRAMMATIC_DOC_ANCHOR_IDS.nearby, label: `Areas near ${loc} we also serve`, level: 2 },
    { id: PROGRAMMATIC_DOC_ANCHOR_IDS.faq, label: "Frequently asked questions", level: 2 },
  ];
}

function getLocalGuideFaqEntities(
  post: ProgrammaticPost,
): { question: string; answer: string }[] {
  const loc = post.location ?? "Cape Town";
  const v = post.guideVariant;
  if (!v) return [];
  const pay =
    "You confirm bedrooms, bathrooms, service tier, and add-ons online—your total is shown before payment, so there is no dispatch surprise.";

  if (v === "pricing") {
    return [
      {
        question: `How much does cleaning cost in ${loc}?`,
        answer: `Atlantic Seaboard scopes vary by apartment size and bathrooms; many standard visits trend from roughly R450 upward before add-ons, while deep resets scale with kitchen and bathroom time. ${pay}`,
      },
      {
        question: `Why do ${loc} quotes differ between providers?`,
        answer:
          "Lift access, parking, coastal dust load, and whether ovens or fridges are inside scope all change realistic crew time—compare itemised quotes, not vague hourly rates.",
      },
      {
        question: `When is deep cleaning worth the premium in ${loc}?`,
        answer:
          "After busy guest weeks, before handover photos, or when kitchens and bathrooms have fallen behind standard upkeep—deep visits budget honest dwell time for those zones.",
      },
      {
        question: `Can I see prices without paying upfront?`,
        answer: pay,
      },
    ];
  }

  if (v === "cleaning_frequency") {
    return [
      {
        question: `How often should I book cleaning in ${loc}?`,
        answer:
          "Busy kitchens and bathrooms on the Atlantic Seaboard usually benefit from biweekly standard cycles; lighter-use studios may stretch to monthly with tighter spot routines between visits.",
      },
      {
        question: `How often should Airbnb hosts clean in ${loc}?`,
        answer:
          "Turnovers follow guest calendars—most hosts book per checkout with buffer time for linen and staging; stack deeper resets seasonally.",
      },
      {
        question: `When should I step up from standard to deep cleaning?`,
        answer:
          "After guest-heavy stretches, before inspections, or when ovens, grout-adjacent zones, and bathrooms lag standard upkeep—deep visits budget honest dwell time.",
      },
      {
        question: `Can I see pricing before committing?`,
        answer: pay,
      },
    ];
  }

  if (v === "deep_checklist") {
    return [
      {
        question: `What should a deep clean include in ${loc}?`,
        answer:
          "Kitchens (stovetops, reachable cupboards fronts, sinks), full bathrooms, hard floors and dust-downs, plus agreed extras such as ovens or fridges when selected.",
      },
      {
        question: `Why mention balconies for ${loc} deep cleans?`,
        answer:
          "Coastal grit resets faster outdoors—if you want balconies mopped or rails wiped, include them so crew time matches scope.",
      },
      {
        question: `How is deep cleaning priced differently from standard?`,
        answer:
          "Deep tiers allocate more dwell time for build-up zones; your quote reflects bathrooms, kitchen intensity, and add-ons you tick at checkout.",
      },
      {
        question: `Can I lock a total before payment?`,
        answer: pay,
      },
    ];
  }

  if (v === "move_out_cost") {
    return [
      {
        question: `How much does move-out cleaning cost in ${loc}?`,
        answer: `Costs scale with bedrooms, bathrooms, and whether ovens, fridges, or inside cupboards are included—many ${loc} handovers need detail time beyond a standard reset. ${pay}`,
      },
      {
        question: `What makes move-out cleaning more expensive than a standard visit?`,
        answer:
          "Deposit-focused scopes touch skirting, inside ovens/fridges when chosen, fuller bathrooms, and edge dust—items agents photograph.",
      },
      {
        question: `Should I book move-out cleaning before the final inspection?`,
        answer:
          "Yes—schedule early enough to photograph issues while crews can still address agreed checklist misses within support policies.",
      },
      {
        question: `Can I compare move-out scope online first?`,
        answer: pay,
      },
    ];
  }

  if (v === "best_services") {
    return [
      {
        question: `What should I look for in a ${loc} cleaning company?`,
        answer:
          "Itemised quotes, vetted and insured teams, clear redo/support paths, and reviews that mention punctuality on Atlantic Seaboard routes—not just generic star averages.",
      },
      {
        question: `Standard vs deep cleaning in ${loc}—which do I need?`,
        answer:
          "Standard maintains kitchens, bathrooms, and floors between visits; deep cleaning adds dwell time for build-up, ovens, grout-adjacent work, and detail zones after busy seasons.",
      },
      {
        question: `Are Airbnb turnovers different from regular home cleans?`,
        answer:
          "Yes—turnovers prioritise guest-ready wet areas, presentation, and tight checkout-to-check-in windows; accurate bedroom and bathroom counts keep routing realistic.",
      },
      {
        question: `Do you offer same-week availability in ${loc}?`,
        answer:
          "Often yes, especially for standard scopes—deep and move-out visits may need longer windows. Check live slots online for your exact address.",
      },
    ];
  }

  return [
    {
      question: `How do I prep my ${loc} apartment for a cleaner?`,
      answer:
        "Clear countertops where work is requested, secure valuables, note lift/remotes/parking, and list balcony or outdoor zones only if you want them in scope.",
    },
    {
      question: `Why does coastal dust come back so fast?`,
      answer:
        "Sea breeze deposits fine grit—more frequent vacuuming passes on hard floors and realistic mop time on booking notes prevent rushed visits.",
    },
    {
      question: `What should Airbnb hosts mention for turnovers?`,
      answer:
        "Linen handling, staging expectations, checkout time, and whether fridges or ovens need reset—those details keep turnovers aligned with guest photos.",
    },
    {
      question: `Can I book without paying before seeing the total?`,
      answer: pay,
    },
  ];
}

export function getProgrammaticFaqEntities(
  post: ProgrammaticPost,
): { question: string; answer: string }[] {
  const loc = post.location ?? "Cape Town";
  if (post.service === "local-guide") {
    return getLocalGuideFaqEntities(post);
  }
  const svc = programmaticServiceLabel(post);
  return [
    {
      question: `How much does ${svc} cost in ${loc}?`,
      answer:
        "Pricing follows home size, bathrooms, service tier, and add-ons. Shalean's booking flow shows an itemised total for Cape Town addresses before you pay.",
    },
    {
      question: `How soon can I get a cleaner in ${loc}?`,
      answer:
        "Availability changes with seasonality and same-day demand. Enter your dates online to see open slots for your address.",
    },
    {
      question: "What is included in my booking?",
      answer:
        "Inclusions match the service tier and extras you select during booking—kitchens, bathrooms, floors, and add-ons such as oven, fridge, or carpet scope when chosen.",
    },
    {
      question: "Do you supply products and equipment?",
      answer:
        "Yes—professional visits are supplied unless your booking states otherwise. Add estate rules or pet notes so crews arrive prepared.",
    },
    {
      question: `Is ${svc} right for a rental handover?`,
      answer:
        post.service === "move-out"
          ? "Move-out cleaning is designed for handovers—pair it with inventory lists and photos required by your agent."
          : "Compare your tier with move-out scope if deposits are involved; many tenants combine detail cleaning with handover checklists.",
    },
  ];
}
