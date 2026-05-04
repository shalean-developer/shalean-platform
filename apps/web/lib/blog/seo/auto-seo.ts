import { slugifyTitle } from "@/lib/blog/slugify-title";
import { optimizeMeta, type OptimizeMetaContext } from "@/lib/blog/seo/optimize-meta";

export type SearchIntent = "informational" | "transactional" | "commercial" | "navigational";

export type AutoSeoInput = {
  title: string;
  primary_keyword?: string | null;
  secondary_keywords?: string[] | null;
  search_intent?: string | null;
};

export type AutoSeoSuggestions = {
  slug: string;
  h1: string;
  meta_title: string;
  meta_description: string;
  title_for_row: string;
};

function titleCaseKeyword(kw: string): string {
  const t = kw.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t
    .split(" ")
    .map((w) => (w.length <= 2 ? w : w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Build OptimizeMetaContext from keyword-only input when location/service names are unknown. */
function fallbackOptimizeContext(primary: string): OptimizeMetaContext {
  const bits = primary.trim().split(/\s+/).filter(Boolean);
  const city = bits.includes("cape") && bits.includes("town") ? "Cape Town" : "Cape Town";
  const locGuess =
    bits.find((b) => !["cape", "town", "cleaning", "clean", "deep", "standard", "house", "home", "services"].includes(b.toLowerCase())) ??
    "your area";
  const svcGuess =
    bits.some((b) => b.toLowerCase().includes("deep")) ? "Deep cleaning"
    : bits.some((b) => b.toLowerCase().includes("airbnb")) ? "Airbnb cleaning"
    : bits.some((b) => b.toLowerCase().includes("move")) ? "Move-out cleaning"
    : "Home cleaning";

  return {
    location: titleCaseKeyword(locGuess) || "Claremont",
    city,
    service: svcGuess,
  };
}

/**
 * Suggested SEO fields from primary keyword + optional title seed.
 * Safe to call with empty keyword (returns title-based fallbacks).
 */
export function suggestAutoSeo(input: AutoSeoInput): AutoSeoSuggestions {
  const pk = (input.primary_keyword ?? "").trim();
  const baseTitle = input.title.trim() || pk || "Cleaning guide";

  if (!pk) {
    const slug = slugifyTitle(baseTitle);
    const meta_title = `${baseTitle} | Shalean`.slice(0, 60);
    const meta_description = `Practical cleaning guidance from Shalean — Cape Town teams, clear booking, vetted cleaners.`.slice(0, 155);
    return {
      slug,
      h1: baseTitle,
      meta_title,
      meta_description,
      title_for_row: baseTitle,
    };
  }

  const slug = slugifyTitle(pk);
  const ctx = fallbackOptimizeContext(pk);
  const om = optimizeMeta(
    {
      title: `${baseTitle} | Shalean`,
      meta_title: `${pk} | Book online | Shalean`,
      meta_description: `Book trusted cleaning in Cape Town. ${titleCaseKeyword(pk)} — clear scope, vetted teams, simple online scheduling.`,
    },
    ctx,
  );

  const h1 =
    input.search_intent === "transactional"
      ? `${titleCaseKeyword(pk)} — Book online`
      : `${titleCaseKeyword(pk)}: what to know`;

  return {
    slug,
    h1: h1.slice(0, 120),
    meta_title: om.meta_title,
    meta_description: om.meta_description,
    title_for_row: om.title.replace(/\s*\|\s*Shalean\s*$/i, "").trim() || baseTitle,
  };
}

export function normalizeSearchIntent(raw: string | null | undefined): SearchIntent | null {
  if (!raw || typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "informational" || v === "transactional" || v === "commercial" || v === "navigational") {
    return v;
  }
  return null;
}
