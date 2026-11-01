import { REGULAR_CLEANING_PUBLIC_NAME } from "@/lib/services/publicServiceNames";

/** Preferred title display budget; complete service and place names take priority. */
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

/** Preserve complete title text; the display budget is advisory, not a slicing rule. */
export function clipSerpTitle(raw: string, _maxLen = DEFAULT_SERP_TITLE_MAX): string {
  return raw.trim().replace(/\s+/g, " ");
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
  /** Preferred display budget; never a hard cut through essential title text. */
  maxLen?: number;
};

const DEFAULT_FROM_PRICE = "~R380";

/**
 * Deterministic CTR `<title>` templates (location + service hubs). Same stability rules as meta descriptions.
 * Try complete compact alternatives within `maxLen`; never cut the service or place name.
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
  const preferred = templates[idx]({ b, p, fp, brand });
  const core = `${b} in ${p}`;
  const near = pageIntent === "location" ? `${b} Near You | ${p}${brand}` : "";
  const candidates = [preferred, near, `${core}${brand}`, core].filter(Boolean);
  return clipSerpTitle(candidates.find((title) => title.length <= maxLen) ?? `${core}${brand}`);

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
 * CTR `<title>` base for `/services/*`: keeps Regular Cleaning as the public product label
 * while supporting “standard home cleaning” naturally in service metadata/body copy.
 */
export function serviceTitleBaseForCtr(bookingLabel: string, slug: string): string {
  const raw = serviceTitleBaseFromBookingLabel(bookingLabel);
  if (slug === "standard-cleaning-cape-town") return REGULAR_CLEANING_PUBLIC_NAME;
  if (slug === "deep-cleaning-cape-town") return "Deep Cleaning Services";
  return raw;
}

/**
 * Preserve the complete editorial headline. Geo and brand are optional suffixes,
 * never a reason to publish an ellipsis or repeat an existing location/brand.
 * The preferred display length is a soft budget, not a content validation rule.
 */
export function generateBlogArticleTitle(input: {
  headline: string;
  slugKey: string;
  /** Only add a year when explicitly requested; never imply a fresh review automatically. */
  year?: number;
  brand?: string;
}): string {
  const raw = typeof input.headline === "string" ? input.headline : String(input.headline ?? "");
  const h = raw.trim().replace(/\s+/g, " ") || "Cleaning guide";
  const brand = typeof input.brand === "string" ? input.brand.trim() : "Shalean";
  const hasBrand = /\bShalean(?: Blog| Cleaning Services)?\b/i.test(h) ||
    Boolean(brand && h.toLowerCase().includes(brand.toLowerCase()));
  const year = input.year !== undefined && !h.includes(String(input.year)) ? ` (${input.year})` : "";
  const headline = `${h}${year}`;
  const geo = /\bCape Town\b/i.test(h) ? "" : " | Cape Town";
  const suffix = brand && !hasBrand ? ` | ${brand}` : "";
  const candidates = [`${headline}${geo}${suffix}`, `${headline}${suffix}`, headline];
  return candidates.find((candidate) => candidate.length <= BLOG_SERP_TITLE_MAX) ?? headline;
}
