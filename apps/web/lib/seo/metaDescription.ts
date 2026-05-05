const MIN_LEN = 120;
const MAX_LEN = 160;
const SHORT_PAD = " Book trusted cleaners online today.";

/**
 * CTR phrases when no explicit `variant` is passed. Rotated deterministically — never `Math.random()`.
 */
export const CTR_HOOK_PHRASES = [
  "Same-day availability",
  "Same-day cleaning when routing allows",
  "Trusted local cleaners",
  "Easy online booking",
  "Flexible scheduling",
  "Top-rated service",
  "Book in minutes",
  "No hidden fees",
  "Instant quote online",
] as const;

function fnv1a32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function stableHookIndex(key: string, len: number): number {
  return fnv1a32(`${key}|hook`) % len;
}

function stableStructureIndex(key: string, len: number): number {
  return fnv1a32(`${key}|structure`) % len;
}

/** Pick a stable hook for `key` (e.g. slug or `service|location`). */
export function pickCtrHookPhrase(key: string): string {
  const k = key.trim() || "default";
  return CTR_HOOK_PHRASES[stableHookIndex(k, CTR_HOOK_PHRASES.length)];
}

/** Short geo line from hub `region` (e.g. Atlantic Seaboard). */
export function hubRegionGeoBoostLine(region: string | null | undefined): string | undefined {
  const r = typeof region === "string" ? region.trim() : "";
  if (!r) return undefined;
  return `Serving ${r} homes`;
}

function sentenceCaseHook(hook: string): string {
  const t = hook.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type StructureCtx = {
  base: string;
  place: string;
  hook: string;
  geoBoost?: string;
};

function geoSegAfterLead(geoBoost: string | undefined): string {
  const g = geoBoost?.trim();
  return g ? ` ${g}.` : "";
}

const META_DESCRIPTION_STRUCTURES: readonly ((ctx: StructureCtx) => string)[] = [
  ({ base, place, hook, geoBoost }) => {
    const geo = geoSegAfterLead(geoBoost);
    return `${base} in ${place}.${geo} ${hook}, transparent pricing, and fast booking. Book today.`;
  },
  ({ base, place, hook, geoBoost }) => {
    const geo = geoSegAfterLead(geoBoost);
    return `Looking for ${base.toLowerCase()} in ${place}?${geo} ${hook} with upfront pricing and quick online booking.`;
  },
  ({ base, place, hook, geoBoost }) => {
    const geo = geoSegAfterLead(geoBoost);
    return `${place} ${base.toLowerCase()} with ${hook.toLowerCase()}.${geo} No hidden fees and easy online booking. Get started today.`;
  },
  ({ base, place, hook, geoBoost }) => {
    const geo = geoSegAfterLead(geoBoost);
    return `Book ${base.toLowerCase()} in ${place}.${geo} ${hook}, trusted cleaners, and instant quotes available online.`;
  },
];

export type GenerateMetaDescriptionArgs = {
  service?: string;
  location?: string;
  variant?: string;
  /** Optional second clause for hub pages, e.g. {@link hubRegionGeoBoostLine}. */
  geoBoost?: string;
  /** Stable key for structural template rotation (slug recommended). Defaults to `service|location`. */
  templateKey?: string;
};

/**
 * Keyword-led meta copy with **deterministic structural variation**, optional geo boost, then **120–160** clamp.
 */
export function generateMetaDescription({
  service,
  location,
  variant,
  geoBoost,
  templateKey,
}: GenerateMetaDescriptionArgs): string {
  const base = (service ?? "Cleaning services").trim() || "Cleaning services";
  const place = (location ?? "Cape Town").trim() || "Cape Town";
  const v = variant?.trim();
  const hook = sentenceCaseHook(v || pickCtrHookPhrase(`${base}|${place}`));

  const key = (templateKey?.trim() || `${base}|${place}`) || "default";
  const si = stableStructureIndex(key, META_DESCRIPTION_STRUCTURES.length);
  const raw = META_DESCRIPTION_STRUCTURES[si]({ base, place, hook, geoBoost });
  return clampMetaDescription(raw.replace(/\s+/g, " ").trim());
}

function pickBlogTitle(metaTitle?: string | null, title?: string | null): string {
  const m = typeof metaTitle === "string" ? metaTitle.trim() : "";
  if (m) return m;
  const t = typeof title === "string" ? title.trim() : "";
  return t || "Blog";
}

/** CMS post meta: prefers `meta_description`, then `excerpt`, then CTR template from title. */
export function resolveBlogDbMetaDescription(input: {
  metaTitle?: string | null;
  title?: string | null;
  metaDescription?: string | null;
  excerpt?: string | null;
}): string {
  const titleBase = pickBlogTitle(input.metaTitle, input.title);
  const meta = typeof input.metaDescription === "string" ? input.metaDescription.trim() : "";
  const excerpt = typeof input.excerpt === "string" ? input.excerpt.trim() : "";
  const slugKey = titleBase.toLowerCase().replace(/\s+/g, "-").slice(0, 80);
  const raw =
    meta ||
    excerpt ||
    generateMetaDescription({
      service: titleBase,
      location: "Cape Town",
      variant: "Expert pricing and cleaning guide",
      templateKey: `blog|${slugKey}`,
    });
  return clampMetaDescription(raw);
}

/** Enforces 120–160 chars for meta name="description" and matching OG/Twitter copy. */
export function clampMetaDescription(text: string): string {
  let s = text.trim().replace(/\s+/g, " ");
  if (!s) {
    s = generateMetaDescription({});
  }

  while (s.length < MIN_LEN) {
    s = `${s}${SHORT_PAD}`.trim();
  }

  if (s.length > MAX_LEN) {
    s = `${s.slice(0, MAX_LEN - 3).trimEnd()}...`;
  }

  return s;
}
