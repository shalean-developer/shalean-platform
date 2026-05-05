import { resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";
import { clampMetaDescription } from "@/lib/seo/metaDescription";

export type AirbnbHostGuidePost = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  primaryKeyword: string;
  publishedAt: string;
  dateModified: string;
  readingTimeMinutes: number;
  faqs: { q: string; a: string }[];
};

const PUBLISHED = "2026-05-04T09:00:00+02:00";
const MODIFIED = "2026-05-04T10:00:00+02:00";

const PAY =
  "You confirm bedrooms, bathrooms, Airbnb turnover scope, and add-ons online—your total is shown before payment.";

export const AIRBNB_HOST_GUIDE_POSTS: AirbnbHostGuidePost[] = [
  {
    slug: "airbnb-cleaning-checklist-cape-town",
    title: "Airbnb Cleaning Checklist for Hosts in Cape Town",
    description:
      "Room-by-room Airbnb turnover checklist for Cape Town hosts: kitchens, bathrooms, floors, linen, and guest-ready finishing—plus what to brief cleaners before tight changeovers.",
    h1: "Airbnb Cleaning Checklist for Hosts in Cape Town",
    primaryKeyword: "Airbnb cleaning checklist Cape Town",
    publishedAt: PUBLISHED,
    dateModified: MODIFIED,
    readingTimeMinutes: 9,
    faqs: [
      {
        q: "What should an Airbnb turnover checklist include in Cape Town?",
        a: `Kitchen reset (hob, sink, counters, appliance fronts, bins), bathroom sanitising and mirrors, vacuum-to-edge floors then mop hard surfaces, high-touch wipes, and visible restocking of essentials you supply. ${PAY}`,
      },
      {
        q: "How is an Airbnb clean different from standard home cleaning?",
        a:
          "Guests judge presentation fast—photos, scent, and bathroom sparkle matter immediately. Turnovers also compress work into shorter gaps between check-out and check-in.",
      },
      {
        q: "Should I mention parking and estate rules in booking notes?",
        a:
          "Yes. Atlantic Seaboard lifts, Southern Suburb gates, and narrow streets change realistic arrival time—precise notes prevent crews losing minutes before cleaning starts.",
      },
      {
        q: "Can Shalean handle same-day turnovers?",
        a:
          "When the gap between guests and routing allows, yes—share exact check-out/check-in times and remote access details so schedules stay realistic.",
      },
    ],
  },
  {
    slug: "airbnb-cleaning-cost-cape-town",
    title: "How Much Does Airbnb Cleaning Cost in Cape Town?",
    description:
      "Airbnb cleaning prices in Cape Town explained: bedroom and bathroom drivers, turnover extras, Atlantic Seaboard vs Southern Suburbs access—and how to lock an exact total online.",
    h1: "How Much Does Airbnb Cleaning Cost in Cape Town?",
    primaryKeyword: "Airbnb cleaning cost Cape Town",
    publishedAt: PUBLISHED,
    dateModified: MODIFIED,
    readingTimeMinutes: 8,
    faqs: [
      {
        q: "What is a realistic Airbnb turnover price range in Cape Town?",
        a:
          "Many compact one-bed turnovers trend roughly R350–R650 before heavy add-ons; larger two-bed coastal apartments often land nearer R500–R900 when bathrooms, balconies, and kitchens need full dwell time.",
      },
      {
        q: "What increases Airbnb cleaning cost the fastest?",
        a:
          "Extra bathrooms, inside-fridge or oven work, linen staging when supplied, and resets after unusually messy stays—all add honest crew minutes beyond a standard turnover baseline.",
      },
      {
        q: "Why do quotes differ between suburbs?",
        a:
          "Parking friction, estate security steps, lift transfers, and coastal dust loads change how much cleaning time fits into the same calendar gap—notes keep quotes aligned with reality.",
      },
      {
        q: "Can I see my total before paying?",
        a: PAY,
      },
    ],
  },
  {
    slug: "prepare-airbnb-for-cleaning",
    title: "How to Prepare Your Airbnb for Cleaning Between Guests",
    description:
      "Prepare your Cape Town Airbnb for turnover cleaning: access, supplies, linen, inventory photos, and damage flags—so cleaners maximise cleaning minutes during tight guest gaps.",
    h1: "How to Prepare Your Airbnb for Cleaning Between Guests",
    primaryKeyword: "prepare Airbnb for cleaning",
    publishedAt: PUBLISHED,
    dateModified: MODIFIED,
    readingTimeMinutes: 7,
    faqs: [
      {
        q: "What should hosts tidy before a turnover crew arrives?",
        a:
          "Remove personal clutter from surfaces crews must sanitise, empty bins if checkout guidance requires it, and leave linen bundles staged clearly when swaps are booked.",
      },
      {
        q: "How should I document damage before cleaners start?",
        a:
          "Time-stamped photos of scratches, stains, or missing inventory protect everyone—share urgent issues in booking notes so crews do not reset a scene that needs host review.",
      },
      {
        q: "What supplies should hosts leave out?",
        a:
          "Guest toiletries you want replenished, spare bin liners, dishwasher tabs, and any branded consumables you advertise—visibility beats hiding extras in locked cupboards.",
      },
      {
        q: "Where do I book vetted turnover cleaners in Cape Town?",
        a:
          "Use Shalean’s Airbnb turnover guide at /services/airbnb-cleaning-cape-town to align scope online, then confirm bedrooms, bathrooms, and add-ons until the total matches your listing.",
      },
    ],
  },
  {
    slug: "best-airbnb-cleaning-tips-cape-town",
    title: "Best Airbnb Cleaning Tips for Cape Town Hosts",
    description:
      "High-impact Airbnb turnover tips for Cape Town: prioritise bathrooms and kitchens first, beat coastal dust, brief lifts and parking honestly, and protect reviews with repeatable guest-ready resets.",
    h1: "Best Airbnb Cleaning Tips for Cape Town Hosts",
    primaryKeyword: "Airbnb cleaning tips Cape Town",
    publishedAt: PUBLISHED,
    dateModified: MODIFIED,
    readingTimeMinutes: 8,
    faqs: [
      {
        q: "What should Cape Town hosts clean first on a turnover?",
        a:
          "Kitchens and bathrooms carry review weight—degrease hobs and sinks before counters pick up residue; sanitise glass and drains before floors so you do not re-soil finished zones.",
      },
      {
        q: "How do I handle Atlantic Seaboard sand and dust?",
        a:
          "Vacuum edges and door tracks before mopping; balconies advertised in photos need a quick sweep when windy stretch grit resets overnight.",
      },
      {
        q: "Should I mention parking in booking notes?",
        a:
          "Yes—minutes lost to ambiguous loading rules shrink effective cleaning time; bay labels and intercom steps matter in Sea Point and Green Point blocks.",
      },
      {
        q: "Where do I book professional turnovers?",
        a: PAY,
      },
    ],
  },
  {
    slug: "how-often-to-clean-airbnb-cape-town",
    title: "How Often Should You Clean an Airbnb in Cape Town?",
    description:
      "Cadence guide for Cape Town Airbnb hosts: per checkout turnovers vs deeper resets, seasonal peaks, and when to step up scope before reviews slip.",
    h1: "How Often Should You Clean an Airbnb in Cape Town?",
    primaryKeyword: "how often clean Airbnb Cape Town",
    publishedAt: PUBLISHED,
    dateModified: MODIFIED,
    readingTimeMinutes: 7,
    faqs: [
      {
        q: "Do I clean after every guest?",
        a:
          "Most short-stay calendars book a turnover after each checkout—scope follows bedrooms, bathrooms, and add-ons you select online before payment.",
      },
      {
        q: "When should hosts schedule a deeper reset?",
        a:
          "After busy holiday weeks, festival weekends, or when kitchens and grout lag standard upkeep—deep visits budget honest dwell time instead of compressing mess into minimum turnovers.",
      },
      {
        q: "Does peak season change cadence?",
        a:
          "Peak tightens slots; it rarely removes the need for a full turnover—buffer realistic gaps so floors dry and lifts clear during arrivals.",
      },
      {
        q: "Can I see pricing before committing?",
        a: PAY,
      },
    ],
  },
  {
    slug: "airbnb-cleaning-mistakes-hosts-make",
    title: "Airbnb Cleaning Mistakes Cape Town Hosts Make (And How to Avoid Them)",
    description:
      "Common Airbnb turnover mistakes in Cape Town: vague access notes, under-scoped kitchens, ignoring balcony grit, and compressing changeovers—plus fixes that protect ratings.",
    h1: "Airbnb Cleaning Mistakes Cape Town Hosts Make",
    primaryKeyword: "Airbnb cleaning mistakes hosts",
    publishedAt: PUBLISHED,
    dateModified: MODIFIED,
    readingTimeMinutes: 8,
    faqs: [
      {
        q: "What is the biggest turnover mistake hosts make?",
        a:
          "Optimistic calendars—assuming a minimum clean fits every checkout—when kitchens, pet hair seasons, or windy balcony dust actually need more dwell time.",
      },
      {
        q: "Why do vague access notes hurt outcomes?",
        a:
          "Crews lose minutes before cleaning starts; that time often came from bathroom polishing or kitchen finishes guests photograph first.",
      },
      {
        q: "Should hosts hide supplies from cleaners?",
        a:
          "If guests expect stocked detergents or toiletries, stage them visibly—cleaners should not hunt through private cupboards mid-slot.",
      },
      {
        q: "How do I align crews with listing photos?",
        a:
          "Brief cushion placement, towel folds, and consumable visibility against your gallery shots—repeatability trains guest expectations.",
      },
    ],
  },
];

export function getAirbnbHostGuidePost(slug: string): AirbnbHostGuidePost | null {
  return AIRBNB_HOST_GUIDE_POSTS.find((p) => p.slug === slug) ?? null;
}

function buildBreadcrumbJsonLd(siteOrigin: string, slug: string, h1: string) {
  const pageUrl = `${siteOrigin}/blog/${slug}`;
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteOrigin },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteOrigin}/blog` },
      { "@type": "ListItem", position: 3, name: h1, item: pageUrl },
    ],
  };
}

function buildFaqJsonLd(faqs: AirbnbHostGuidePost["faqs"]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function buildAirbnbHostGuideGraphJsonLd(post: AirbnbHostGuidePost, siteOrigin: string) {
  const pageUrl = `${siteOrigin}/blog/${post.slug}`;
  const heroAbsolute = `${siteOrigin}${resolveBlogFeaturedSrc(post.slug)}`;
  const heroAlt = resolveBlogFeaturedAlt(post.slug);
  const keywords = [post.primaryKeyword, "Airbnb Cape Town", "Shalean", "turnover cleaning"].join(", ");

  const blogPosting = {
    "@type": ["BlogPosting", "Article"],
    headline: post.h1,
    description: clampMetaDescription(post.description),
    datePublished: post.publishedAt,
    dateModified: post.dateModified,
    image: [heroAbsolute],
    keywords,
    articleSection: "Airbnb hosting guides",
    author: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
    },
    publisher: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
      url: siteOrigin,
      logo: {
        "@type": "ImageObject",
        url: `${siteOrigin}/images/marketing/cape-town-house-cleaning-kitchen.webp`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [blogPosting, buildBreadcrumbJsonLd(siteOrigin, post.slug, post.h1), buildFaqJsonLd(post.faqs)],
  };
}
