/** SERP title cap — balances pixel width vs keeping primary keywords + brand visible. */
export const DEFAULT_SERP_TITLE_MAX = 65;
/** Blog posts / taxonomy titles often carry a longer headline before geo + brand. */
export const BLOG_SERP_TITLE_MAX = 68;

export type TitlePageIntent = "location" | "service" | "hub";

function fnv1a32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function stableTitleStructureIndex(key: string, len: number): number {
  return fnv1a32(`${key}|title`) % len;
}

/**
 * Hard-cap length; trims on a space when possible so truncation is less abrupt than mid-token cuts.
 */
export function clipSerpTitle(raw: string, maxLen = DEFAULT_SERP_TITLE_MAX): string {
  const t = raw.trim();
  if (t.length <= maxLen) return t;
  const ellipsis = "…";
  const budget = Math.max(1, maxLen - ellipsis.length);
  let cut = t.slice(0, budget).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace >= Math.floor(budget * 0.45)) {
    cut = cut.slice(0, lastSpace).trimEnd();
  }
  if (!cut) {
    return `${t.slice(0, budget)}${ellipsis}`;
  }
  return `${cut}${ellipsis}`;
}

export type GenerateCtrTitleArgs = {
  base: string;
  place: string;
  /** Lead price token for price-aware templates, e.g. "~R450" */
  fromPrice?: string;
  templateKey: string;
  /** Appended as ` | Shalean` when non-empty */
  brandSuffix?: string;
  /** Location hubs use proximity language; service & hub pages use standard CTR rotation. */
  pageIntent?: TitlePageIntent;
  maxLen?: number;
};

const DEFAULT_FROM_PRICE = "~R380";

/**
 * Deterministic CTR `<title>` templates (location + service hubs). Same stability rules as meta descriptions.
 * Templates stay compact (`|` separators, minimal modifiers); `clipSerpTitle` enforces `maxLen`.
 */
export function generateCtrTitle({
  base,
  place,
  fromPrice = DEFAULT_FROM_PRICE,
  templateKey,
  brandSuffix = "Shalean",
  pageIntent = "service",
  maxLen = DEFAULT_SERP_TITLE_MAX,
}: GenerateCtrTitleArgs): string {
  const b = base.trim() || "Cleaning services";
  const p = place.trim() || "Cape Town";
  const fp = (fromPrice ?? DEFAULT_FROM_PRICE).trim() || DEFAULT_FROM_PRICE;
  const brand = brandSuffix.trim() ? ` | ${brandSuffix.trim()}` : "";

  type Args = { b: string; p: string; fp: string; brand: string };

  const serviceOrHubTemplates: ((a: Args) => string)[] = [
    ({ b, p, brand }) => `${b} in ${p}${brand}`,
    ({ b, p, brand }) => `${b} | ${p}${brand}`,
    ({ b, p, fp, brand }) => `${b} in ${p} | From ${fp}${brand}`,
    ({ b, p, brand }) => `${b} in ${p} | Same-Day Booking${brand}`,
  ];

  const locationTemplates: ((a: Args) => string)[] = [
    ({ b, p, brand }) => `${b} Near You in ${p}${brand}`,
    ({ b, p, brand }) => `${b} in ${p} | Near You${brand}`,
    ({ b, p, fp, brand }) => `${b} Near You in ${p} | ${fp}${brand}`,
    ({ b, p, brand }) => `${b} Near You | ${p}${brand}`,
  ];

  const templates = pageIntent === "location" ? locationTemplates : serviceOrHubTemplates;
  const idx = stableTitleStructureIndex(templateKey, templates.length);
  return clipSerpTitle(templates[idx]({ b, p, fp, brand }), maxLen);
}

/** Matches service meta description base phrase (booking funnel labels → title case + "service"). */
export function serviceTitleBaseFromBookingLabel(label: string): string {
  const t = label.trim();
  if (!t) return "Cleaning services";
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  if (/\bservice\b/i.test(cap)) return cap;
  return `${cap} service`;
}

/**
 * CTR `<title>` base for `/services/*`: aligns standard cleaning with “home cleaning” queries
 * without collapsing specialised slugs (deep, move-out, Airbnb, etc.) into one phrase.
 */
export function serviceTitleBaseForCtr(bookingLabel: string, slug: string): string {
  const raw = serviceTitleBaseFromBookingLabel(bookingLabel);
  if (slug === "standard-cleaning-cape-town") return "Home Cleaning Services";
  return raw;
}

const BLOG_TITLE_STRUCTURES: readonly ((h: string, year: number, brand: string) => string)[] = [
  (h, year, brand) => `${h} | Cape Town (${year}) | ${brand}`,
  (h, year, brand) => `${h} (${year}) | Cape Town | ${brand}`,
];

/**
 * Blog listing `<title>` — year + geo + deterministic secondary template from slug.
 */
export function generateBlogArticleTitle(input: {
  headline: string;
  slugKey: string;
  year?: number;
  brand?: string;
}): string {
  const year = input.year ?? new Date().getFullYear();
  const headlineRaw = typeof input.headline === "string" ? input.headline : String(input.headline ?? "");
  const h = headlineRaw.trim() || "Cleaning guide";
  const brand = typeof input.brand === "string" ? input.brand.trim() : String(input.brand ?? "Shalean Blog").trim();
  const slugKeyRaw = typeof input.slugKey === "string" ? input.slugKey : String(input.slugKey ?? "");
  const idx = stableTitleStructureIndex(slugKeyRaw.trim() || "blog", BLOG_TITLE_STRUCTURES.length);
  const raw = BLOG_TITLE_STRUCTURES[idx](h, year, brand);
  return clipSerpTitle(raw, BLOG_SERP_TITLE_MAX);
}
