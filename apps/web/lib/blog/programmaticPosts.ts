import type { CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import { BLOG_POST_SLUGS } from "./posts";

export type ProgrammaticPost = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  primaryKeyword: string;
  location?: string;
  service: "deep" | "standard" | "airbnb" | "move-out" | "carpet";
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
};

const PROGRAMMATIC_PUBLISHED_AT = "2026-04-01T09:00:00+02:00";
const PROGRAMMATIC_DATE_MODIFIED = "2026-04-28T09:00:00+02:00";

export const PROGRAMMATIC_POSTS: ProgrammaticPost[] = [
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
    slug: "move-out-cleaning-rondebosch-cape-town",
    title: "Move-Out Cleaning in Rondebosch, Cape Town",
    description: "End of lease cleaning in Rondebosch to help secure your deposit.",
    h1: "Move-Out Cleaning in Rondebosch, Cape Town",
    primaryKeyword: "move out cleaning Rondebosch Cape Town",
    location: "Rondebosch",
    service: "move-out",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },

  // GARDENS
  {
    slug: "deep-cleaning-gardens-cape-town",
    title: "Deep Cleaning Services in Gardens, Cape Town",
    description: "Professional deep cleaning in Gardens for apartments and homes.",
    h1: "Deep Cleaning in Gardens, Cape Town",
    primaryKeyword: "deep cleaning Gardens Cape Town",
    location: "Gardens",
    service: "deep",
    publishedAt: PROGRAMMATIC_PUBLISHED_AT,
    dateModified: PROGRAMMATIC_DATE_MODIFIED,
  },
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
];

const SLUG_SET = new Set(PROGRAMMATIC_POSTS.map((p) => p.slug));

for (const s of BLOG_POST_SLUGS) {
  if (SLUG_SET.has(s)) {
    throw new Error(`Programmatic slug collides with editorial blog slug: ${s}`);
  }
}

export function getProgrammaticPost(slug: string): ProgrammaticPost | null {
  return PROGRAMMATIC_POSTS.find((p) => p.slug === slug) ?? null;
}

const AREA_BLOG_HUB_LOCATIONS = ["Claremont", "Sea Point", "Rondebosch", "Gardens", "Wynberg"] as const;

type ProgrammaticServiceForAreaHub = ProgrammaticPost["service"];

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
};

const AREA_HUB_LINK_LABEL_PHRASE: Record<ProgrammaticServiceForAreaHub, string> = {
  deep: "Deep cleaning",
  standard: "Standard cleaning",
  airbnb: "Airbnb cleaning",
  "move-out": "Move-out cleaning",
  carpet: "Carpet cleaning",
};

/** Internal links from Cape Town service SEO pages to matching programmatic /blog/* area posts. */
export function getAreaProgrammaticBlogLinksForCapeTownService(
  slug: CapeTownSeoServiceSlug,
): { href: string; label: string }[] | null {
  const svc = CAPE_TOWN_SERVICE_SLUG_TO_PROGRAMMATIC_SERVICE[slug];
  if (!svc) return null;
  const phrase = AREA_HUB_LINK_LABEL_PHRASE[svc];
  return AREA_BLOG_HUB_LOCATIONS.map((loc) => {
    const post = PROGRAMMATIC_POSTS.find((p) => p.service === svc && p.location === loc);
    if (!post) {
      throw new Error(`Missing programmatic post for service "${svc}" in ${loc}`);
    }
    return { href: `/blog/${post.slug}`, label: `${phrase} in ${loc}` };
  });
}

export function getNearbySuburbsForProgrammaticPost(location: string | undefined): string[] {
  if (!location) return ["Sea Point", "Claremont", "Rondebosch", "Gardens", "Wynberg"];
  return PROGRAMMATIC_LOCATION_NEARBY[location] ?? [];
}

export function programmaticServiceLabel(service: ProgrammaticPost["service"]): string {
  switch (service) {
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

export function getProgrammaticFaqEntities(
  post: ProgrammaticPost,
): { question: string; answer: string }[] {
  const loc = post.location ?? "Cape Town";
  const svc = programmaticServiceLabel(post.service);
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
