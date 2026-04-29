export const BLOG_POST_SLUGS = [
  "airbnb-cleaning-checklist",
  "cleaning-cost-cape-town",
  "move-out-cleaning-guide",
  "deep-vs-standard-cleaning-cape-town",
] as const;

export type BlogPostSlug = (typeof BLOG_POST_SLUGS)[number];

export type BlogPostMeta = {
  slug: BlogPostSlug;
  title: string;
  /** SEO meta description + Open Graph */
  description: string;
  /** Short card text for /blog listing */
  excerpt: string;
  /** Hero for LCP, OG, Twitter, and BlogPosting `image` — under `/public/images/blog/` */
  heroImage: { src: string; alt: string };
  /** ISO 8601 date for Article / BlogPosting schema */
  publishedAt: string;
  /** ISO 8601 — defaults to `publishedAt` in JSON-LD when omitted */
  dateModified?: string;
  /** Minutes */
  readingTimeMinutes: number;
  /** 4–6 bullets for featured-snippet style summary (rendered above article body). */
  quickSummary: string[];
  /** Short “who / when” copy under the global when-to-use heading. */
  whenToUseParagraphs: string[];
  /** Preferred related articles; backfilled to 3–5 in `resolveRelatedPosts`. */
  relatedSlugs: BlogPostSlug[];
};

export const BLOG_POSTS: Record<BlogPostSlug, BlogPostMeta> = {
  "airbnb-cleaning-checklist": {
    slug: "airbnb-cleaning-checklist",
    title: "Airbnb Cleaning Checklist for Cape Town Hosts",
    description:
      "Airbnb cleaning checklist for Cape Town hosts: turnover resets, room-by-room tasks, same-day tips, FAQs, and when to book professional Airbnb or deep cleaning with Shalean.",
    excerpt:
      "Room-by-room Airbnb turnover checklist for Cape Town—bedrooms, bathrooms, kitchen, living areas, final checks, and booking tips for hosts.",
    heroImage: {
      src: "/images/blog/airbnb-cleaning-checklist.webp",
      alt: "Professional Airbnb turnover cleaning in Sea Point, Cape Town — guest-ready living space",
    },
    publishedAt: "2026-01-18T09:00:00+02:00",
    dateModified: "2026-04-10T10:00:00+02:00",
    readingTimeMinutes: 11,
    quickSummary: [
      "Turnover cleaning in Cape Town is about guest-ready resets—not a light tidy—especially between tight check-outs and check-ins.",
      "Prioritise wet areas first, then floors, then presentation: linen, mirrors, bins, and supplies guests photograph.",
      "Coastal dust and balcony debris are common; build time for same-day slots in Sea Point, the CBD, and busy Airbnb corridors.",
      "Pair regular turnovers with occasional deep cleaning so ovens, grout, and detail zones do not slow every changeover.",
      "Book online with accurate bedrooms and bathrooms so pricing and availability match real handover windows.",
    ],
    whenToUseParagraphs: [
      "This guide is for Cape Town hosts and managers running short-term rentals, Airbnb turnover, or busy calendars where reviews depend on consistency.",
      "Use it when guests expect hotel-level bathrooms and kitchens, or when you need a repeatable checklist for cleaners across Claremont, Gardens, Rondebosch, and Atlantic Seaboard listings.",
    ],
    relatedSlugs: ["deep-vs-standard-cleaning-cape-town", "move-out-cleaning-guide", "cleaning-cost-cape-town"],
  },
  "cleaning-cost-cape-town": {
    slug: "cleaning-cost-cape-town",
    title: "How Much Does Cleaning Cost in Cape Town? (2026 Guide)",
    description:
      "Average cleaning prices in Cape Town, what affects cost (home size, service type, add-ons, frequency), and how to get an accurate quote online with Shalean.",
    excerpt:
      "Typical price ranges for standard, deep, move-out, and Airbnb cleaning in Cape Town—plus what moves your quote and how to book with transparent pricing.",
    heroImage: {
      src: "/images/blog/cleaning-cost-cape-town.webp",
      alt: "House cleaning cost guide — bright kitchen in Claremont, Cape Town after professional cleaning",
    },
    publishedAt: "2026-02-05T09:00:00+02:00",
    dateModified: "2026-04-01T09:00:00+02:00",
    readingTimeMinutes: 9,
    quickSummary: [
      "Cleaning prices in Cape Town depend on home size, bathrooms, service tier (standard, deep, move-out, Airbnb), and add-ons.",
      "Typical session bands help you budget, but an online quote with accurate rooms beats guessing for rentals and busy households.",
      "Frequency and bundling can change totals—regular standard visits often cost less per visit than one-off deep resets.",
      "Suburbs like Rondebosch, Sea Point, and the CBD share the same booking logic; access and parking notes still matter for crews.",
      "Use instant booking to see live pricing before you pay—no surprises after you have picked scope and timing.",
    ],
    whenToUseParagraphs: [
      "Read this when you are comparing tiers for a Cape Town home, rental, or Airbnb and want realistic price context before you book.",
      "It is especially helpful if you are new to professional cleaning or rebudgeting after a move, handover, or change in household size.",
    ],
    relatedSlugs: ["deep-vs-standard-cleaning-cape-town", "airbnb-cleaning-checklist", "move-out-cleaning-guide"],
  },
  "move-out-cleaning-guide": {
    slug: "move-out-cleaning-guide",
    title: "Move-Out Cleaning in Cape Town: Rental Handover Guide (2026)",
    description:
      "Step-by-step move-out cleaning guidance for Cape Town tenants and landlords: timing, scope, inspection hotspots, and when to book a handover-ready clean.",
    excerpt:
      "Align move-out timing, scope, and inspection hotspots with realistic Cape Town rental handovers.",
    heroImage: {
      src: "/images/blog/move-out-cleaning-guide.webp",
      alt: "Move-out cleaning for a Cape Town rental — handover-ready kitchen and living areas before keys return",
    },
    publishedAt: "2026-02-22T09:00:00+02:00",
    dateModified: "2026-03-15T09:00:00+02:00",
    readingTimeMinutes: 9,
    quickSummary: [
      "Western Cape rental inspections zero in on kitchens, bathrooms, and floors—book cleaning after furniture is out when possible.",
      "Deep grime or neglected ovens may need deep cleaning scope in addition to move-out cleaning so handover photos hold up.",
      "Cape Town complexes often need access codes and parking notes; line these up before the crew arrives.",
      "Two-week and 48-hour checklists reduce deposit disputes for tenants and protect landlords in Sea Point, Claremont, and CBD stock.",
      "Instant booking shows whether your handover date still has capacity during peak moving weeks.",
    ],
    whenToUseParagraphs: [
      "Use this timeline when you are exiting a Cape Town lease, preparing a rental for new tenants, or coordinating keys with an agent.",
      "It suits busy households and Airbnb-style furnished rentals where handover photos and inventory lists must match reality.",
    ],
    relatedSlugs: ["deep-vs-standard-cleaning-cape-town", "cleaning-cost-cape-town", "airbnb-cleaning-checklist"],
  },
  "deep-vs-standard-cleaning-cape-town": {
    slug: "deep-vs-standard-cleaning-cape-town",
    title: "Deep Cleaning vs Standard Cleaning in Cape Town: How to Choose the Right Service",
    description:
      "Compare deep cleaning and standard cleaning for Cape Town homes: what each tier covers, when to book which, how Airbnb turnover fits in, and FAQs before you book.",
    excerpt:
      "Decide between standard and deep cleaning in Cape Town—scope, triggers, Airbnb turnover, and booking tips in one guide.",
    heroImage: {
      src: "/images/blog/deep-vs-standard-cleaning-cape-town.webp",
      alt: "Deep cleaning vs standard cleaning — Rondebosch family kitchen and living areas in Cape Town",
    },
    publishedAt: "2026-04-28T09:00:00+02:00",
    readingTimeMinutes: 10,
    quickSummary: [
      "Standard cleaning in Cape Town keeps high-traffic areas guest-livable on a rhythm; deep cleaning resets build-up and detail zones.",
      "Choose standard when recent deep work exists and you mainly need floors, wet areas, and dusting on a schedule.",
      "Book deep cleaning before peak season, after renovations, or when ovens, grout, and bathrooms need more dwell time.",
      "Airbnb turnover is its own pace—often tighter than maintenance cleans—so align tier and add-ons to guest arrival, not only square metres.",
      "Gardens, Claremont, and Sea Point homes all use the same tiers; scope and honesty about condition matter more than suburb alone.",
    ],
    whenToUseParagraphs: [
      "This comparison is for Cape Town homeowners, renters, and hosts who are unsure which tier matches their next visit.",
      "Reach for it before you book if you are juggling Airbnb changeovers, post-tenancy handovers, or a busy household that has skipped detail cleans for a while.",
    ],
    relatedSlugs: ["airbnb-cleaning-checklist", "move-out-cleaning-guide", "cleaning-cost-cape-town"],
  },
};

export function getBlogPost(slug: string): BlogPostMeta | null {
  return BLOG_POSTS[slug as BlogPostSlug] ?? null;
}

/** Newest first — stable for listing + sitemap consumers. */
export function getAllBlogPosts(): BlogPostMeta[] {
  return BLOG_POST_SLUGS.map((s) => BLOG_POSTS[s]).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}
