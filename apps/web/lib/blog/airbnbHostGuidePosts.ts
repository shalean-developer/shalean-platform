import { resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";

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
    "@type": "BlogPosting",
    headline: post.h1,
    description: post.description,
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
