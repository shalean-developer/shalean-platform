import type { BlogIndexPost } from "@/lib/blog/get-all-posts";
import { DEFAULT_LIST_HERO } from "@/lib/blog/get-all-posts";
import { FOOTER_POPULAR_LOCATION_HUBS } from "@/lib/seo/locations";

/** Category filters shown on /blog (URL `?topic=`). */
export type BlogTopicFilterId = "pricing" | "move-out" | "airbnb" | "deep-cleaning" | "booking";

export type BlogIndexCardPost = BlogIndexPost & {
  topics: BlogTopicFilterId[];
  cardBadge: string;
  displayExcerpt: string;
};

/** Preferred hero article when published; otherwise newest post is featured. */
export const BLOG_FEATURED_SLUG_PREFERENCE = "cleaning-prices-cape-town-guide";

/** Curated “most popular” strip (filled from merge list; padded by recency). */
export const BLOG_MOST_POPULAR_SLUGS: string[] = [
  "cleaning-prices-cape-town-guide",
  "deep-cleaning-vs-standard-cleaning-cape-town-choice",
  "move-out-cleaning-checklist-cape-town-renters",
  "airbnb-cleaning-vs-regular-home-cleaning-cape-town",
];

/** Re-export for blog index (same seven priority suburbs as the footer). */
export const BLOG_INDEX_LOCATION_HUBS = FOOTER_POPULAR_LOCATION_HUBS;

export const BLOG_TOPIC_FILTER_OPTIONS: { id: BlogTopicFilterId | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pricing", label: "Pricing" },
  { id: "move-out", label: "Move-out" },
  { id: "airbnb", label: "Airbnb" },
  { id: "deep-cleaning", label: "Deep cleaning" },
  { id: "booking", label: "Booking" },
];

const TOPIC_META: Record<BlogTopicFilterId, string> = {
  pricing: "Pricing & quotes",
  "move-out": "Move-out cleaning",
  airbnb: "Airbnb cleaning",
  "deep-cleaning": "Deep cleaning guides",
  booking: "Booking tips",
};

export function blogTopicMetaLabel(topic: BlogTopicFilterId): string {
  return TOPIC_META[topic];
}

export const BLOG_START_HERE_CARDS: {
  title: string;
  body: string;
  href: string;
  cta: string;
}[] = [
  {
    title: "Pricing clarity",
    body: "Cleaning prices Cape Town and cost of cleaning service—what moves quotes before you pay.",
    href: "/blog/cleaning-prices-cape-town-guide",
    cta: "Explore pricing guides",
  },
  {
    title: "Move-out handover",
    body: "Checklists and scope tips for renters—from Wynberg to Sea Point inventory cleans.",
    href: "/blog/move-out-cleaning-checklist-cape-town-renters",
    cta: "Move-out guides",
  },
  {
    title: "Airbnb hosting",
    body: "Turnovers, guest-ready polish, and when deep cleaning beats a quick tidy.",
    href: "/blog/airbnb-cleaning-vs-regular-home-cleaning-cape-town",
    cta: "Airbnb articles",
  },
  {
    title: "Book online",
    body: "Cleaners near me with instant totals—bedrooms, baths, and add-ons locked before checkout.",
    href: "/booking",
    cta: "Get instant quote",
  },
];

const TOPIC_OVERRIDES: Partial<Record<string, BlogTopicFilterId[]>> = {
  "cleaning-prices-cape-town-guide": ["pricing"],
  "how-much-house-cleaning-costs-cape-town": ["pricing"],
  "book-home-cleaning-online-cape-town-checklist": ["booking"],
  "what-affects-cleaning-quotes-cape-town": ["pricing"],
  "deep-cleaning-vs-standard-cleaning-cape-town-choice": ["deep-cleaning", "pricing"],
  "airbnb-cleaning-vs-regular-home-cleaning-cape-town": ["airbnb"],
  "last-minute-cleaning-cape-town-rescue-plan": ["booking"],
  "move-out-cleaning-checklist-cape-town-renters": ["move-out"],
  "prepare-home-professional-cleaning-cape-town": ["booking"],
  "how-often-book-home-cleaning-cape-town": ["pricing", "booking"],
  "airbnb-cleaning-checklist": ["airbnb"],
  "cleaning-cost-cape-town": ["pricing"],
  "move-out-cleaning-guide": ["move-out"],
  "deep-vs-standard-cleaning-cape-town": ["deep-cleaning", "pricing"],
};

const LIST_IMAGE_POOL: { src: string; alt: string }[] = [
  {
    src: "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
    alt: "Deep kitchen cleaning in a Cape Town home",
  },
  {
    src: "/images/marketing/standard-cleaning-cape-town-kitchen.webp",
    alt: "Standard home cleaning in a Cape Town kitchen",
  },
  {
    src: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    alt: "Professional cleaner vacuuming a bedroom in Cape Town",
  },
  {
    src: "/images/marketing/bright-living-room-after-cleaning-cape-town.webp",
    alt: "Bright living room after professional cleaning in Cape Town",
  },
  {
    src: "/images/marketing/airbnb-cleaning-cape-town-living-room.webp",
    alt: "Guest-ready living space after Airbnb turnover cleaning in Cape Town",
  },
  {
    src: "/images/marketing/move-out-cleaning-cape-town-handover.webp",
    alt: "Move-out cleaning ready for handover in Cape Town",
  },
  {
    src: "/images/marketing/bathroom-kitchen-deep-clean-cape-town.webp",
    alt: "Bathroom and kitchen deep cleaning in Cape Town",
  },
  {
    src: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    alt: "Cleaning team refreshing a bright Cape Town living space",
  },
];

const BENEFIT_EXCERPT_BY_SLUG: Partial<Record<string, string>> = {
  "cleaning-prices-cape-town-guide":
    "Skip guesswork: learn what drives cleaning prices Cape Town quotes so your cost of cleaning service matches real time on site.",
  "how-much-house-cleaning-costs-cape-town":
    "See how house cleaning totals shift by rooms, bathrooms, and service tier—then compare cleaners near me with the same scope.",
  "book-home-cleaning-online-cape-town-checklist":
    "Book home cleaning online without rework: scope, access notes, and instant totals before you confirm a slot.",
  "what-affects-cleaning-quotes-cape-town":
    "Understand what affects cleaning quotes Cape Town teams prepare—stairs, pets, ovens—so nothing surprises you at handover.",
  "deep-cleaning-vs-standard-cleaning-cape-town-choice":
    "Choose deep vs standard cleaning with confidence: same address, different chemistry and clock time.",
  "airbnb-cleaning-vs-regular-home-cleaning-cape-town":
    "Host smarter: know when Airbnb turnovers need guest-ready polish vs a maintenance tidy at home.",
  "last-minute-cleaning-cape-town-rescue-plan":
    "Short-notice mess? A practical rescue plan for Cape Town homes when guests or landlords move faster than dust settles.",
  "move-out-cleaning-checklist-cape-town-renters":
    "Protect your deposit: a renter-focused move-out cleaning checklist covering kitchens, wet rooms, and final walk-throughs.",
  "prepare-home-professional-cleaning-cape-town":
    "Maximise every booked hour—prep clutter, pets, and supplies so pros focus on scrubbing, not sorting.",
  "how-often-book-home-cleaning-cape-town":
    "Cadence that fits Cape Town life: how often to book home cleaning when kids, pets, or coastal dust accelerate mess.",
  "airbnb-cleaning-checklist":
    "Turnover-ready fast: bedroom, bathroom, and kitchen checkpoints Cape Town hosts can repeat between guests.",
  "cleaning-cost-cape-town":
    "Benchmark cost of cleaning service bands in Cape Town and learn what moves your online quote in real time.",
  "move-out-cleaning-guide":
    "End-of-lease cleaning guide that aligns scope with inspections—fewer callbacks, cleaner handovers.",
  "deep-vs-standard-cleaning-cape-town":
    "Pick the right service tier before you pay: where deep cleaning earns its minutes vs standard upkeep.",
};

function simpleHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function varietyListImage(slug: string, image: { src: string; alt: string }): { src: string; alt: string } {
  if (image.src !== DEFAULT_LIST_HERO) {
    return image;
  }
  const pick = LIST_IMAGE_POOL[simpleHash(slug) % LIST_IMAGE_POOL.length];
  return {
    src: pick.src,
    alt: image.alt?.trim() ? image.alt : pick.alt,
  };
}

function deriveTopics(post: BlogIndexPost): BlogTopicFilterId[] {
  const manual = TOPIC_OVERRIDES[post.slug];
  if (manual?.length) {
    return [...manual];
  }

  const s = `${post.slug} ${post.title}`.toLowerCase();
  const out = new Set<BlogTopicFilterId>();

  if (/move-out|move out|handover|end of lease|inventory/.test(s)) {
    out.add("move-out");
  }
  if (/airbnb|turnover|short-term|guest-ready/.test(s)) {
    out.add("airbnb");
  }
  if (/price|pricing|cost|quote|how much|fee|rates/.test(s)) {
    out.add("pricing");
  }
  if (/deep-clean|deep clean|deep-cleaning|thorough clean|top-to-bottom/.test(s)) {
    out.add("deep-cleaning");
  }
  if (
    /book.*online|same-day|same day|instant quote|last-minute|last minute|book home cleaning|book a clean|how often book/.test(
      s,
    )
  ) {
    out.add("booking");
  }

  if (/standard-cleaning-/.test(post.slug)) {
    out.add("pricing");
  }

  return [...out];
}

function pickCardBadge(post: BlogIndexPost, topics: BlogTopicFilterId[]): string {
  if (topics.includes("move-out")) return "Move-out";
  if (topics.includes("airbnb")) return "Airbnb";
  if (topics.includes("deep-cleaning")) return "Deep cleaning";
  if (topics.includes("pricing")) return "Pricing";
  if (topics.includes("booking")) return "Booking";

  const cn = post.categoryName?.trim();
  if (cn) {
    if (/comparison/i.test(cn)) return "Comparison";
    if (/tips/i.test(cn)) return "Guide";
    if (/local/i.test(cn)) return "Local";
    return cn.length > 22 ? `${cn.slice(0, 19)}…` : cn;
  }
  return "Article";
}

function benefitExcerpt(post: BlogIndexPost): string {
  const hit = BENEFIT_EXCERPT_BY_SLUG[post.slug];
  if (hit) return hit;
  const base = post.excerpt.trim();
  if (base.length > 200) return `${base.slice(0, 197)}…`;
  return base;
}

export function enrichBlogPostForIndexCard(post: BlogIndexPost): BlogIndexCardPost {
  const topics = deriveTopics(post);
  const image = varietyListImage(post.slug, post.image);

  return {
    ...post,
    image,
    topics,
    cardBadge: pickCardBadge(post, topics),
    displayExcerpt: benefitExcerpt(post),
  };
}

export function enrichBlogPostsForIndexCards(posts: BlogIndexPost[]): BlogIndexCardPost[] {
  return posts.map(enrichBlogPostForIndexCard);
}

export function resolveFeaturedPost(posts: BlogIndexCardPost[]): BlogIndexCardPost | null {
  if (posts.length === 0) return null;
  const preferred = posts.find((p) => p.slug === BLOG_FEATURED_SLUG_PREFERENCE);
  return preferred ?? posts[0];
}

export function resolvePopularPosts(posts: BlogIndexCardPost[]): BlogIndexCardPost[] {
  const map = new Map(posts.map((p) => [p.slug, p]));
  const out: BlogIndexCardPost[] = [];

  for (const slug of BLOG_MOST_POPULAR_SLUGS) {
    const p = map.get(slug);
    if (p && !out.some((o) => o.slug === p.slug)) out.push(p);
    if (out.length >= 4) return out;
  }

  for (const p of posts) {
    if (out.length >= 4) break;
    if (!out.some((o) => o.slug === p.slug)) out.push(p);
  }

  return out.slice(0, 4);
}

export function parseBlogTopicParam(raw: string | string[] | undefined): BlogTopicFilterId | "all" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const t = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!t || t === "all") return "all";
  const allowed = new Set<BlogTopicFilterId>([
    "pricing",
    "move-out",
    "airbnb",
    "deep-cleaning",
    "booking",
  ]);
  return allowed.has(t as BlogTopicFilterId) ? (t as BlogTopicFilterId) : "all";
}

export function filterPostsByTopic<T extends { topics: BlogTopicFilterId[] }>(
  posts: T[],
  topic: BlogTopicFilterId | "all",
): T[] {
  if (topic === "all") return posts;
  return posts.filter((p) => p.topics.includes(topic));
}
