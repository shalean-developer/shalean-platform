import type { HighConversionBlogArticle } from "@/lib/blog/highConversionBlogArticle";
import { stableHash } from "@/lib/seo/anchorVariants";

const DEFAULT_GEO = "Cape Town";
const DEFAULT_BRAND = "Shalean";

function normToken(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Dedupe case-insensitively, preserve first-seen casing, comma-join for schema.org `keywords`. */
export function commaJoinSchemaKeywords(phrases: readonly string[], max = 14): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of phrases) {
    const t = normToken(raw);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out.join(", ");
}

export type ArticleSchemaKeywordParts = {
  primary?: string | null;
  secondary?: readonly string[] | null;
  /** e.g. suburb / neighbourhood labels */
  localModifiers?: readonly string[] | null;
  /** e.g. informational vs transactional framing */
  intentModifiers?: readonly string[] | null;
  /** Always-on brand/geo anchors */
  brand?: string;
  serviceRegion?: string;
};

export function buildArticleSchemaKeywords(parts: ArticleSchemaKeywordParts): string {
  const brand = parts.brand?.trim() || DEFAULT_BRAND;
  const region = parts.serviceRegion?.trim() || DEFAULT_GEO;
  const chunks: string[] = [];

  if (parts.primary?.trim()) chunks.push(parts.primary.trim());
  for (const s of parts.secondary ?? []) {
    if (s?.trim()) chunks.push(s.trim());
  }
  for (const s of parts.localModifiers ?? []) {
    if (s?.trim()) chunks.push(s.trim());
  }
  for (const s of parts.intentModifiers ?? []) {
    if (s?.trim()) chunks.push(s.trim());
  }

  chunks.push(`${region} cleaning`, `${brand} Cleaning Services`);
  return commaJoinSchemaKeywords(chunks);
}

/**
 * BlogPosting `keywords` for in-repo high-conversion articles.
 * Uses explicit {@link HighConversionBlogArticle.schemaKeywords} when present; otherwise derives
 * a stable, article-specific phrase set from headline, location, and optional taxonomy fields.
 */
export function buildHighConversionBlogPostingKeywordsString(post: HighConversionBlogArticle): string {
  const explicit = post.schemaKeywords;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return commaJoinSchemaKeywords(explicit);
  }

  const chunks: string[] = [];

  if (post.primaryKeyword?.trim()) chunks.push(post.primaryKeyword.trim());
  for (const s of post.secondaryKeywords ?? []) {
    if (s?.trim()) chunks.push(s.trim());
  }
  for (const s of post.localSeoModifiers ?? []) {
    if (s?.trim()) chunks.push(s.trim());
  }
  for (const s of post.searchIntentModifiers ?? []) {
    if (s?.trim()) chunks.push(s.trim());
  }

  const head = normToken(post.h1);
  const title = normToken(post.title);
  if (head.toLowerCase() !== title.toLowerCase()) {
    chunks.push(head, title);
  } else {
    chunks.push(head);
  }

  if (post.primaryLocation?.label?.trim()) {
    chunks.push(post.primaryLocation.label.trim());
  }
  if (post.mandatoryAdditionalService?.label?.trim()) {
    chunks.push(post.mandatoryAdditionalService.label.trim());
  }

  const sec0 = post.sections[0]?.heading?.trim();
  if (sec0) chunks.push(sec0);

  const intentRoll = stableHash(`${post.slug}|kw-intent`) % 4;
  const intentHints = [
    "home cleaning guide",
    "professional cleaning tips",
    "book cleaning online",
    "Cape Town cleaning advice",
  ];
  chunks.push(intentHints[intentRoll]!);

  return buildArticleSchemaKeywords({
    primary: chunks[0] ?? post.slug.replace(/-/g, " "),
    secondary: chunks.slice(1),
    brand: DEFAULT_BRAND,
    serviceRegion: DEFAULT_GEO,
  });
}
