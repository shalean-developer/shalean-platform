/**
 * Central featured-image routing for blog posts (Supabase, programmatic, high-conversion).
 *
 * `BLOG_IMAGE_MAP` is built deterministically so each routed slug gets a stable asset.
 * Prefer mapped/local WebPs under `/public/images/blog/` and `/public/images/marketing/`.
 */

import { LOCATION_HUB_SEO_IMAGE_SLUGS } from "@/lib/blog/injectLocationHubSeoImages";
import { PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { HIGH_CONVERSION_POSTS } from "@/lib/blog/highConversionPosts";
import { LEGACY_EDITORIAL_SLUGS } from "@/lib/blog/posts";

/**
 * Fallback when a slug has no `BLOG_IMAGE_MAP` entry (should not occur for routed static slugs)
 * and the CMS provides no image.
 */
export const DEFAULT_BLOG_FEATURED_IMAGE = "/images/default-cleaning.jpg";

const HUB_LOCATIONS = [
  "claremont",
  "sea-point",
  "rondebosch",
  "gardens",
  "wynberg",
  "green-point",
  "durbanville",
] as const;

const HUB_VARIANTS = ["deep-kitchen", "living-room", "professional-clean"] as const;

const MARKETING_FEATURED_PATHS = [
  "/images/marketing/deep-cleaning-hero.webp",
  "/images/marketing/office-cleaning-workspace-cape-town.webp",
  "/images/marketing/airbnb-cleaning-cape-town-living-room.webp",
  "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
  "/images/marketing/carpet-cleaning-cape-town-sofas-rugs.webp",
  "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
  "/images/marketing/house-deep-cleaning-cape-town.webp",
  "/images/marketing/bathroom-kitchen-deep-clean-cape-town.webp",
  "/images/marketing/standard-cleaning-cape-town-kitchen.webp",
  "/images/marketing/move-out-cleaning-cape-town-handover.webp",
  "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
  "/images/marketing/cleaning-team-bright-space-cape-town.webp",
  "/images/marketing/office-cleaning-cape-town-workspace.webp",
  "/images/marketing/sofa-carpet-care-cape-town.webp",
  "/images/marketing/cape-town-house-cleaning-kitchen.webp",
  "/images/marketing/professional-cleaner-cape-town.webp",
  "/images/marketing/bright-living-room-after-cleaning-cape-town.webp",
] as const;

const LEGACY_BLOG_PATHS = [
  "/images/blog/airbnb-cleaning-checklist.webp",
  "/images/blog/cleaning-cost-cape-town.webp",
  "/images/blog/move-out-cleaning-guide.webp",
  "/images/blog/deep-vs-standard-cleaning-cape-town.webp",
] as const;

/**
 * Brand photography imported from Cursor workspace assets (`scripts/import-cursor-blog-png-pool.ts` → WebP).
 * Extends the programmatic featured pool so more slugs get unique heroes before the pool reuses paths.
 */
export const BLOG_CURSOR_POOL_WEBPS = [
  "/images/blog/pool/cape-town-tiles-floor-mopping.webp",
  "/images/blog/pool/cape-town-sage-room-professional-clean.webp",
  "/images/blog/pool/cape-town-dark-wood-floor-room.webp",
  "/images/blog/pool/cape-town-modern-toilet-terrazzo.webp",
  "/images/blog/pool/cape-town-small-office-lounge.webp",
  "/images/blog/pool/cape-town-commercial-hallway-carpet.webp",
  "/images/blog/pool/cape-town-busy-office-desks.webp",
  "/images/blog/pool/cape-town-bedroom-built-in-wardrobe.webp",
  "/images/blog/pool/cape-town-guest-bed-white-linens.webp",
  "/images/blog/pool/cape-town-bedroom-protea-pillows.webp",
  "/images/blog/pool/cape-town-bedroom-protea-runner.webp",
  "/images/blog/pool/cape-town-bedroom-protea-luxury.webp",
  "/images/blog/pool/cape-town-carpet-extraction-bedroom.webp",
  "/images/blog/pool/cape-town-studio-kitchenette-empty.webp",
  "/images/blog/pool/cape-town-living-seaview-sofas.webp",
  "/images/blog/pool/cape-town-apartment-lounge-palm-view.webp",
  "/images/blog/pool/cape-town-living-room-tiled-balcony.webp",
  "/images/blog/pool/cape-town-bathroom-shower-beige-tile.webp",
  "/images/blog/pool/cape-town-bathroom-sink-round-mirror.webp",
  "/images/blog/pool/cape-town-bedroom-yellow-throw.webp",
  "/images/blog/pool/cape-town-open-plan-floor-polish.webp",
] as const;

/** Explicit overrides (canonical editorial art — WebP). Values must be unique within `PINNED_BLOG_IMAGE_MAP`. */
const BLOG_IMAGE_MAP_OVERRIDES: Record<string, string> = {
  "airbnb-cleaning-checklist": "/images/blog/airbnb-cleaning-checklist.webp",
  "airbnb-cleaning-checklist-cape-town": "/images/marketing/cleaning-team-bright-space-cape-town.webp",
  "airbnb-cleaning-cost-cape-town": "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
  "prepare-airbnb-for-cleaning": "/images/marketing/airbnb-cleaning-cape-town-living-room.webp",
  "cleaning-cost-cape-town": "/images/blog/cleaning-cost-cape-town.webp",
  "move-out-cleaning-guide": "/images/blog/move-out-cleaning-guide.webp",
  "deep-vs-standard-cleaning-cape-town": "/images/blog/deep-vs-standard-cleaning-cape-town.webp",
};

/**
 * Additional slug → JPG entries (append-only; keys must not appear in `BLOG_IMAGE_MAP_OVERRIDES`).
 * Brand photography uses `{location}-{room}-{intent}.jpg` under `/public/images/blog/`.
 */
/**
 * Governed CMS slugs that share a pinned hero with an older in-repo slug (no duplicate map paths).
 */
export const BLOG_FEATURED_IMAGE_SLUG_ALIASES: Record<string, string> = {
  "how-to-prepare-home-before-cleaner-arrives-cape-town": "prepare-home-before-cleaner-arrives-cape-town",
};

/** Human alt text for slugs where `generateBlogImageAlt` reads awkwardly. */
const BLOG_FEATURED_ALT_OVERRIDES: Record<string, string> = {
  "prepare-home-before-cleaner-arrives-cape-town":
    "How to prepare your home before a cleaner arrives in Cape Town",
  "how-to-prepare-home-before-cleaner-arrives-cape-town":
    "How to prepare your home before a cleaner arrives in Cape Town",
};

/** CMS/local paths that must never win over slug-based heroes (missing dirs, generic placeholders). */
const UNTRUSTED_BLOG_FEATURED_LOCAL_PREFIXES = ["/images/posts/"] as const;

export function resolveBlogFeaturedImageSlug(slug: string): string {
  const trimmed = slug.trim();
  return BLOG_FEATURED_IMAGE_SLUG_ALIASES[trimmed] ?? trimmed;
}

export function isTrustedBlogFeaturedLocalPath(src: string): boolean {
  const p = src.trim();
  if (!p.startsWith("/")) return false;
  if (p === DEFAULT_BLOG_FEATURED_IMAGE) return false;
  return !UNTRUSTED_BLOG_FEATURED_LOCAL_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export const BLOG_IMAGE_MAP_NEW_ADDITIONS: Record<string, string> = {
  "same-day-cleaning-cape-town": "/images/blog/cape-town-bedroom-guest-ready.jpg",
  "weekly-cleaning-routine-busy-professionals-cape-town": "/images/blog/cape-town-living-room-floor-deep-clean.jpg",
  "carpet-cleaning-sea-point-cape-town": "/images/blog/cape-town-bedroom-carpet-deep-clean.jpg",
  "move-out-cleaning-checklist-cape-town": "/images/blog/cape-town-studio-move-in-clean.jpg",
  "prepare-home-before-cleaner-arrives-cape-town": "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
  "apartment-cleaning-tips-sea-point-cape-town": "/images/blog/sea-point-living-room-residential-clean.jpg",
  "deep-cleaning-vs-regular-cleaning-cape-town": "/images/blog/cape-town-bathroom-apartment-clean.jpg",
  "cleaning-mistakes-that-make-your-home-dirtier-cape-town": "/images/blog/cape-town-bathroom-sanitized.jpg",
  "how-long-does-house-cleaning-take-cape-town": "/images/blog/cape-town-bedroom-residential-tidy.jpg",
  "how-often-deep-clean-home-cape-town": "/images/blog/cape-town-bedroom-home-office-clean.jpg",
  /** Days 7–10 governed drafts (distinct heroes; do not reuse paths already pinned to another slug). */
  "what-professional-cleaners-can-and-cannot-do-cape-town": "/images/marketing/professional-cleaner-cape-town.webp",
  "why-home-still-feels-dirty-after-cleaning-cape-town": "/images/marketing/bright-living-room-after-cleaning-cape-town.webp",
  "move-out-cleaning-checklist-cape-town-tenants": "/images/marketing/move-out-cleaning-cape-town-handover.webp",
  "how-often-should-you-deep-clean-your-home-cape-town": "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
  "what-does-professional-cleaner-do-cape-town": "/images/blog/cape-town-kitchen-deep-clean.jpg",
  "how-much-does-cleaning-cost-cape-town-2026": "/images/blog/cape-town-living-room-floor-mop-clean.jpg",
  /** Same photography as mop hero, distinct URL so `validateBlogImages` stays strict; swap asset when you have a dedicated frame. */
  "is-it-worth-hiring-cleaner-cape-town": "/images/blog/cape-town-cleaning-worth-professional.jpg",
  "best-airbnb-cleaning-tips-cape-town": "/images/blog/pool/cape-town-living-seaview-sofas.webp",
  "how-often-to-clean-airbnb-cape-town": "/images/blog/pool/cape-town-open-plan-floor-polish.webp",
  "airbnb-cleaning-mistakes-hosts-make": "/images/blog/pool/cape-town-bathroom-shower-beige-tile.webp",
};

/** Union of legacy WebP overrides + JPG pins; each value must appear at most once (see `validateBlogImages`). */
export const PINNED_BLOG_IMAGE_MAP: Record<string, string> = {
  ...BLOG_IMAGE_MAP_OVERRIDES,
  ...BLOG_IMAGE_MAP_NEW_ADDITIONS,
};

/**
 * Hard validation: no two slugs may share the same image path (duplicate filenames / URLs).
 * Called at module load for `PINNED_BLOG_IMAGE_MAP` so duplicate pins fail every build.
 */
export function validateBlogImages(map: Record<string, string>): void {
  const byPath = new Map<string, string[]>();
  for (const [slug, imagePath] of Object.entries(map)) {
    if (!byPath.has(imagePath)) byPath.set(imagePath, []);
    byPath.get(imagePath)!.push(slug);
  }
  const duplicates = [...byPath.entries()].filter(([, slugs]) => slugs.length > 1);
  if (duplicates.length === 0) return;
  const detail = duplicates
    .map(([path, slugs]) => `${path} → ${slugs.join(", ")}`)
    .join("; ");
  throw new Error(`[blogImageMap] Duplicate blog images detected: ${detail}`);
}

validateBlogImages(PINNED_BLOG_IMAGE_MAP);

/** Editorial + high-conversion posts that must each have a dedicated row in `PINNED_BLOG_IMAGE_MAP`. */
export const CORE_BLOG_SLUGS_REQUIRING_PINNED_UNIQUE_IMAGE: readonly string[] = [
  ...LEGACY_EDITORIAL_SLUGS,
  ...HIGH_CONVERSION_POSTS.map((p) => p.slug),
];

function hubImagePool(): string[] {
  return HUB_LOCATIONS.flatMap((loc) =>
    HUB_VARIANTS.map((v) => `/images/blog/hubs/cleaning-services-${loc}-${v}.webp`),
  );
}

function uniqueSortedPool(): string[] {
  const pinnedUrls = new Set(Object.values(PINNED_BLOG_IMAGE_MAP));
  const raw = [
    ...hubImagePool(),
    ...MARKETING_FEATURED_PATHS,
    ...LEGACY_BLOG_PATHS,
    ...BLOG_CURSOR_POOL_WEBPS,
  ];
  return [...new Set(raw.filter((p) => !pinnedUrls.has(p)))].sort();
}

export function stableHashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Keywords matched against lowercase asset paths (basename / full path).
 * Extends the brief taxonomy with tokens required for hub + Cursor pool filenames.
 */
export const IMAGE_CATEGORIES = {
  bathroom: ["toilet", "bathroom", "shower", "sink"],
  bedroom: ["bedroom", "bed", "guest-bed", "protea", "wardrobe"],
  living_room: ["lounge", "living-room", "living", "sofa", "seaview"],
  kitchen: ["kitchen", "kitchenette", "deep-kitchen"],
  office: ["office", "workspace", "desks", "hallway"],
  floor: ["floor", "wood", "tile", "terrazzo", "carpet", "polish", "balcony", "studio-", "handover", "tiles-"],
  cleaning_action: ["mop", "vacuum", "professional-clean", "cleaner", "deep-cleaning-hero", "cleaning-team", "sage-room"],
} as const;

export type ImageCategory = keyof typeof IMAGE_CATEGORIES;

const CATEGORY_PRIORITY: readonly ImageCategory[] = [
  "bathroom",
  "bedroom",
  "kitchen",
  "office",
  "living_room",
  "floor",
  "cleaning_action",
];

/** Infer pool image category from its public URL (first matching category wins). */
export function classifyImagePath(imagePath: string): ImageCategory {
  const p = imagePath.toLowerCase();
  for (const cat of CATEGORY_PRIORITY) {
    for (const kw of IMAGE_CATEGORIES[cat]) {
      if (p.includes(kw)) return cat;
    }
  }
  return "living_room";
}

/**
 * Infer topical category from slug for semantic hero matching.
 * Ordered checks avoid treating every `*-cleaning-*` post as generic “action” imagery.
 */
export function getSlugCategory(slug: string): ImageCategory {
  const s = slug.toLowerCase();

  if (s.includes("bathroom")) return "bathroom";
  if (s.includes("bedroom")) return "bedroom";
  if (s.includes("kitchen")) return "kitchen";
  if (s.includes("office")) return "office";

  if (s.includes("move-out") || s.includes("move-in") || s.includes("empty")) return "floor";
  if (s.includes("carpet")) return "floor";

  if (s.includes("airbnb")) return "bedroom";

  if (
    s.includes("deep-cleaning-checklist") ||
    s.includes("same-day") ||
    s.includes("how-often") ||
    s.includes("frequency") ||
    s.includes("prepare-home") ||
    s.includes("how-to-prepare-home") ||
    s.includes("cleaning-mistakes") ||
    s.includes("how-long") ||
    s.includes("worth-hiring") ||
    s.includes("how-much") ||
    s.includes("what-does-professional") ||
    s.includes("professional-cleaner") ||
    s.includes("cleaning-prices") ||
    s.includes("best-cleaning-services") ||
    s.includes("standard-cleaning")
  ) {
    return "cleaning_action";
  }

  if (s.includes("deep-cleaning")) return "kitchen";

  if (s.includes("home-cleaning-frequency")) return "cleaning_action";

  if (s.includes("move-out-cleaning-cost")) return "floor";

  if (s.startsWith("cleaning-services-")) return "living_room";

  return "living_room";
}

/** Max assignments per asset URL in the generated blog map (then counters reset for the next cycle). */
export const MAX_USAGE_PER_IMAGE = 2;

export function canUseBlogImage(image: string, usageCount: Record<string, number>): boolean {
  return (usageCount[image] ?? 0) < MAX_USAGE_PER_IMAGE;
}

/**
 * Assign featured images by slug intent × asset category.
 * Each pool URL may be used up to {@link MAX_USAGE_PER_IMAGE} times before counters reset (full cycle).
 */
export function buildGeneratedBlogImageMap(slugs: string[], pool: string[]): Record<string, string> {
  const uniqueSlugs = [...new Set(slugs)].sort();
  const sortedPool = [...new Set(pool)].sort();

  const byCategory: Record<ImageCategory, string[]> = {
    bathroom: [],
    bedroom: [],
    kitchen: [],
    office: [],
    living_room: [],
    floor: [],
    cleaning_action: [],
  };

  for (const path of sortedPool) {
    const cat = classifyImagePath(path);
    byCategory[cat].push(path);
  }

  const usageCount: Record<string, number> = {};
  const map: Record<string, string> = {};

  const eligibleInCategory = (cat: ImageCategory): string[] =>
    byCategory[cat].filter((p) => canUseBlogImage(p, usageCount));

  const eligibleAny = (): string[] => sortedPool.filter((p) => canUseBlogImage(p, usageCount));

  /** Prefer lowest current usage, then stable slug×path tie-break. */
  const pick = (paths: string[], slug: string): string | undefined => {
    if (paths.length === 0) return undefined;
    let best = paths[0]!;
    let bestUses = usageCount[best] ?? 0;
    let bestTie = stableHashSlug(`${slug}\0${best}`);
    for (let i = 1; i < paths.length; i++) {
      const p = paths[i]!;
      const u = usageCount[p] ?? 0;
      const t = stableHashSlug(`${slug}\0${p}`);
      if (u < bestUses || (u === bestUses && t < bestTie)) {
        best = p;
        bestUses = u;
        bestTie = t;
      }
    }
    usageCount[best] = bestUses + 1;
    return best;
  };

  const resetUsageCycle = (): void => {
    for (const k of Object.keys(usageCount)) delete usageCount[k];
  };

  const fallbackCategoryOrder: readonly ImageCategory[] = [
    "living_room",
    "cleaning_action",
    "kitchen",
    "floor",
    "bedroom",
    "bathroom",
    "office",
  ];

  for (const slug of uniqueSlugs) {
    const assign = (): string => {
      const primary = getSlugCategory(slug);
      const rot = stableHashSlug(slug) % fallbackCategoryOrder.length;
      const rotatedFallback = [
        ...fallbackCategoryOrder.slice(rot),
        ...fallbackCategoryOrder.slice(0, rot),
      ];

      const tryPick = (): string | undefined => {
        let chosen = pick(eligibleInCategory(primary), slug);
        if (chosen) return chosen;

        for (const cat of rotatedFallback) {
          if (cat === primary) continue;
          chosen = pick(eligibleInCategory(cat), slug);
          if (chosen) return chosen;
        }

        return pick(eligibleAny(), slug);
      };

      let chosen = tryPick();
      if (chosen) return chosen;

      resetUsageCycle();
      chosen = tryPick();
      if (chosen) return chosen;

      const emergency = sortedPool[stableHashSlug(slug) % sortedPool.length]!;
      usageCount[emergency] = (usageCount[emergency] ?? 0) + 1;
      return emergency;
    };

    map[slug] = assign();
  }

  return map;
}

/** Slugs that participate in deterministic `GENERATED_MAP` (programmatic, HC, hubs, legacy editorial). */
export function collectSlugsForBlogImageMap(): string[] {
  const slugs: string[] = [
    ...PROGRAMMATIC_POSTS.map((p) => p.slug),
    ...AIRBNB_HOST_GUIDE_POSTS.map((p) => p.slug),
    ...HIGH_CONVERSION_POSTS.map((p) => p.slug),
    ...LOCATION_HUB_SEO_IMAGE_SLUGS,
    ...LEGACY_EDITORIAL_SLUGS,
  ];
  return slugs;
}

const GENERATED_MAP = buildGeneratedBlogImageMap(collectSlugsForBlogImageMap(), uniqueSortedPool());

/** Slug → featured image path under `/public`. Pinned entries win over generated assignments. */
export const BLOG_IMAGE_MAP: Record<string, string> = {
  ...GENERATED_MAP,
  ...PINNED_BLOG_IMAGE_MAP,
};

function logBlogImageMapDevDiagnostics(): void {
  const routed = [...new Set(collectSlugsForBlogImageMap())].sort();
  const pinnedKeys = new Set(Object.keys(PINNED_BLOG_IMAGE_MAP));
  const withoutPinnedHero = routed.filter((s) => !pinnedKeys.has(s));
  console.info(
    `[blogImageMap] Pinned slugs (unique dedicated assets): ${pinnedKeys.size}; total entries in BLOG_IMAGE_MAP: ${Object.keys(BLOG_IMAGE_MAP).length}`,
  );
  console.info(
    `[blogImageMap] Routed slugs still on generated/shared pool (no pinned hero): ${withoutPinnedHero.length}`,
  );
  if (withoutPinnedHero.length > 0 && withoutPinnedHero.length <= 40) {
    console.info("[blogImageMap] Unpinned routed slugs:", withoutPinnedHero.join(", "));
  } else if (withoutPinnedHero.length > 40) {
    console.info(
      "[blogImageMap] First unpinned routed slugs:",
      withoutPinnedHero.slice(0, 25).join(", "),
      "…",
    );
  }
}

function warnDuplicateBlogImageMapValues(): void {
  const byPath = new Map<string, string[]>();
  for (const [slug, path] of Object.entries(BLOG_IMAGE_MAP)) {
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path)!.push(slug);
  }
  const dupPaths = [...byPath.entries()].filter(([, slugs]) => slugs.length > 1);
  if (dupPaths.length === 0) return;
  const slugCount = dupPaths.reduce((n, [, slugs]) => n + slugs.length, 0);
  console.warn(
    `[blogImageMap] ${dupPaths.length} featured image files are shared across ${slugCount} slugs (unique asset pool is smaller than routed posts). Example:`,
    dupPaths[0]![0],
    "→",
    dupPaths[0]![1].slice(0, 5).join(", "),
    dupPaths[0]![1].length > 5 ? "…" : "",
  );
}

function warnMissingPinnedImagesForCoreSlugs(): void {
  for (const slug of CORE_BLOG_SLUGS_REQUIRING_PINNED_UNIQUE_IMAGE) {
    if (!PINNED_BLOG_IMAGE_MAP[slug]) {
      console.error(`[blogImageMap] Missing pinned image for blog slug: ${slug}`);
    }
  }
}

if (process.env.NODE_ENV !== "production") {
  warnMissingPinnedImagesForCoreSlugs();
  console.info(
    `[blogImageMap] Unique pinned blog heroes: ${Object.keys(PINNED_BLOG_IMAGE_MAP).length} (editorial + high-conversion + flagship programmatic pins)`,
  );
  logBlogImageMapDevDiagnostics();
  warnDuplicateBlogImageMapValues();
}

const KNOWN_LOCATION_SEGMENTS = new Set<string>([
  ...HUB_LOCATIONS,
  "observatory",
  "newlands",
  "constantia",
]);

/** Title-case hyphenated segment, e.g. sea-point → Sea Point */
export function titleCaseHyphenSegment(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Best-effort suburb label from programmatic / hub slugs (otherwise null → Cape Town in alt). */
export function extractSuburbFromBlogSlug(slug: string): string | null {
  const hub = /^cleaning-services-(.+)-cape-town$/.exec(slug);
  if (hub) return titleCaseHyphenSegment(hub[1]!);

  const withoutYear = slug.replace(/-\d{4}$/, "");
  if (!withoutYear.endsWith("-cape-town")) return null;
  const inner = withoutYear.slice(0, -("-cape-town".length));
  for (const loc of KNOWN_LOCATION_SEGMENTS) {
    const suffix = `-${loc}`;
    if (inner.endsWith(suffix)) return titleCaseHyphenSegment(loc);
  }
  return null;
}

/**
 * Keyword-rich featured-image alt from slug + optional suburb (for OG, JSON-LD, `<img alt>`).
 * Strips trailing `-cape-town` and a `-YYYY` year segment so the phrase is not redundant with `place`.
 */
export function generateBlogImageAlt(slug: string, suburb?: string | null): string {
  const trimmed = slug.trim().replace(/-\d{4}$/, "");
  const withoutCity = trimmed.replace(/-cape-town$/i, "").trim();
  const raw = withoutCity.length > 0 ? withoutCity : trimmed;
  const base = raw.replaceAll("-", " ").replace(/\s+/g, " ").trim();
  const phrase = base.length > 0 ? base : "home cleaning";
  const place = suburb?.trim() || "Cape Town";
  return `Professional ${phrase} service in ${place}`;
}

/** Alias for `generateBlogImageAlt` (SEO brief naming). */
export const generateAlt = generateBlogImageAlt;

let allowedBlogImageRemoteHostsCache: ReadonlySet<string> | null = null;

/** Hostnames allowed by `next.config.ts` `images.remotePatterns` (keep in sync). */
function allowedBlogImageRemoteHosts(): ReadonlySet<string> {
  if (allowedBlogImageRemoteHostsCache) return allowedBlogImageRemoteHostsCache;
  const s = new Set<string>(["images.unsplash.com"]);
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (raw) s.add(new URL(raw).hostname);
  } catch {
    /* ignore invalid env */
  }
  allowedBlogImageRemoteHostsCache = s;
  return s;
}

/**
 * `next/image` rejects unknown remote hosts at runtime → RSC 500. Coerce CMS URLs to an allowed remote
 * or to a local slug-based/mapped hero path.
 */
export function coerceBlogImageSrcForNext(slug: string, src: string): string {
  const resolved = (src ?? "").trim();
  if (!resolved) return resolveBlogFeaturedSrc(slug.trim(), null);
  if (resolved.startsWith("/")) {
    return isTrustedBlogFeaturedLocalPath(resolved) ? resolved : resolveBlogFeaturedSrc(slug.trim(), null);
  }
  try {
    const u = new URL(resolved);
    if (allowedBlogImageRemoteHosts().has(u.hostname)) return resolved;
  } catch {
    return resolveBlogFeaturedSrc(slug.trim(), null);
  }
  return resolveBlogFeaturedSrc(slug.trim(), null);
}

export function resolveBlogFeaturedSrc(slug: string, dbFeaturedSrc?: string | null): string {
  const trimmedSlug = slug.trim();
  const imageSlug = resolveBlogFeaturedImageSlug(trimmedSlug);
  const mapped = BLOG_IMAGE_MAP[imageSlug];
  if (mapped) return mapped;
  const db = dbFeaturedSrc?.trim();
  if (db && isTrustedBlogFeaturedLocalPath(db)) return db;
  if (db && (db.startsWith("http://") || db.startsWith("https://"))) return db;
  return DEFAULT_BLOG_FEATURED_IMAGE;
}

export function resolveBlogFeaturedAlt(slug: string, dbFeaturedAlt?: string | null): string {
  const trimmedSlug = slug.trim();
  const imageSlug = resolveBlogFeaturedImageSlug(trimmedSlug);
  const override = BLOG_FEATURED_ALT_OVERRIDES[trimmedSlug] ?? BLOG_FEATURED_ALT_OVERRIDES[imageSlug];
  if (override) return override;
  const suburb = extractSuburbFromBlogSlug(trimmedSlug);
  const seoAlt = generateBlogImageAlt(trimmedSlug, suburb);
  if (!BLOG_IMAGE_MAP[imageSlug] && dbFeaturedAlt?.trim()) return dbFeaturedAlt.trim();
  return seoAlt;
}

export function resolveBlogFeaturedAssets(
  slug: string,
  opts?: { dbFeaturedSrc?: string | null; dbFeaturedAlt?: string | null },
): { src: string; alt: string } {
  return {
    src: resolveBlogFeaturedSrc(slug, opts?.dbFeaturedSrc),
    alt: resolveBlogFeaturedAlt(slug, opts?.dbFeaturedAlt),
  };
}
