/**
 * Shalean blog / editorial SEO governance (Cape Town topical graph).
 *
 * Human review + prompt context: keeps cluster intent clean as the content graph grows.
 * Runtime code may import these strings for tooling, validators, or AI prompts later.
 */

/**
 * Pricing-page linking governance:
 * Only link to pricing authority pages when pricing / cost / budget intent is central
 * to the article. Operational, preparation, timing, scope, or expectation-focused
 * articles should avoid unnecessary pricing-hub links to preserve semantic intent
 * separation and reduce cannibalization risk.
 */
export const PRICING_HUB_LINKING_GOVERNANCE = [
  "Pricing-page linking governance:",
  "Only link to pricing authority pages when pricing/cost/budget intent is central to the article.",
  "Operational, preparation, timing, scope, or expectation-focused articles should avoid",
  "unnecessary pricing-hub links to preserve semantic intent separation and reduce cannibalization risk.",
].join(" ");

/**
 * One primary intent per URL:
 * Supporting intents may exist, but every article must clearly own a dominant
 * search intent and semantic role (e.g. service selection vs booking confidence).
 */
export const PRIMARY_INTENT_PER_URL_GOVERNANCE = [
  "One primary intent per URL.",
  "Supporting intents may exist, but every article must clearly own a dominant search intent and semantic role.",
].join(" ");

/**
 * Cluster membership (editorial target — enforce gradually):
 * every article should belong to exactly one semantic cluster and one primary intent layer.
 */
export const CLUSTER_MEMBERSHIP_GOVERNANCE = [
  "Every article should belong to exactly one semantic cluster and one primary intent layer.",
  "Supporting intents may appear, but the dominant role must stay clear for linking, related guides, and analytics.",
].join(" ");

/** Canonical cluster key for booking-confidence / expectation posts (CMS `semantic_cluster` or prompts). */
export const SEMANTIC_CLUSTER_BOOKING_CONFIDENCE = "booking-confidence";

/** Tag slug used on seed JSON / taxonomy for Cluster 2 — booking confidence & expectations. */
export const BLOG_TAG_CLUSTER_BOOKING_CONFIDENCE = "cluster-2";

/** Tag slug for Cluster 1 — service selection framework (add to taxonomy when adopted). */
export const BLOG_TAG_CLUSTER_SERVICE_SELECTION = "cluster-1";

/** Ordered collision scope: first matching tag wins as primary cluster for peer queries. */
export const COLLISION_CLUSTER_TAG_SLUGS = [
  BLOG_TAG_CLUSTER_SERVICE_SELECTION,
  BLOG_TAG_CLUSTER_BOOKING_CONFIDENCE,
] as const;

/** Canonical cluster key for service-selection posts (CMS `semantic_cluster` or prompts). */
export const SEMANTIC_CLUSTER_SERVICE_SELECTION = "service-selection";

/** Planned clusters — keep small; extend only when product needs a new governed graph. */
export const SEMANTIC_CLUSTER_MOVE_OUT_AUTHORITY = "move-out-authority";
export const SEMANTIC_CLUSTER_AIRBNB_TURNOVER = "airbnb-turnover";
export const SEMANTIC_CLUSTER_OFFICE_CLEANING = "office-cleaning";

/** Allowed persisted `blog_posts.semantic_cluster` values (null = unset). */
export const SEMANTIC_CLUSTER_KEYS = [
  SEMANTIC_CLUSTER_SERVICE_SELECTION,
  SEMANTIC_CLUSTER_BOOKING_CONFIDENCE,
  SEMANTIC_CLUSTER_MOVE_OUT_AUTHORITY,
  SEMANTIC_CLUSTER_AIRBNB_TURNOVER,
  SEMANTIC_CLUSTER_OFFICE_CLEANING,
] as const;

export type SemanticClusterKey = (typeof SEMANTIC_CLUSTER_KEYS)[number];

/** Normalize free-text to a stored key, or null if invalid / empty. */
export function normalizeSemanticClusterInput(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  return (SEMANTIC_CLUSTER_KEYS as readonly string[]).includes(t) ? t : null;
}

/**
 * Canonical cluster for governance: persisted column wins, then cluster-* tags.
 * No other inference in Phase 1 (keeps noise low).
 */
export function resolveSemanticClusterKey(opts: {
  persisted: string | null | undefined;
  tags?: string[] | null;
}): string | null {
  const direct = normalizeSemanticClusterInput(opts.persisted);
  if (direct) return direct;
  const set = new Set((opts.tags ?? []).map((t) => String(t).trim().toLowerCase()));
  for (const tag of COLLISION_CLUSTER_TAG_SLUGS) {
    if (set.has(tag)) return clusterTagSlugToSemanticLabel(tag);
  }
  return null;
}

/** Map stored cluster key to a collision tag slug when one exists (legacy peer join). */
export function semanticClusterKeyToCollisionTagSlug(key: string | null | undefined): string | null {
  const k = (key ?? "").trim().toLowerCase();
  if (k === SEMANTIC_CLUSTER_BOOKING_CONFIDENCE) return BLOG_TAG_CLUSTER_BOOKING_CONFIDENCE;
  if (k === SEMANTIC_CLUSTER_SERVICE_SELECTION) return BLOG_TAG_CLUSTER_SERVICE_SELECTION;
  return null;
}

/** Publish-time warning code when booking-confidence content links to the pricing hub. */
export const WARN_BOOKING_CONFIDENCE_PRICING_HUB = "booking_confidence_pricing_hub";

/** Near-duplicate / intent collision hint vs another published post in the same cluster. */
export const WARN_SEMANTIC_OVERLAP_CLUSTER = "semantic_overlap_cluster";

/** Map optional semantic cluster string to a taxonomy tag used for peer queries. */
export function semanticClusterToCollisionTagSlug(semanticCluster: string | null | undefined): string | null {
  return semanticClusterKeyToCollisionTagSlug(normalizeSemanticClusterInput(semanticCluster));
}

/**
 * Resolve which cluster tag slug scopes published peer comparisons (tag-join path).
 * Prefer {@link resolveSemanticClusterKey} + column query; this remains for legacy rows.
 */
export function resolveCollisionClusterTagSlug(opts: {
  tags?: string[] | null;
  semanticCluster?: string | null;
}): string | null {
  const key = resolveSemanticClusterKey({
    persisted: opts.semanticCluster,
    tags: opts.tags ?? [],
  });
  const fromKey = semanticClusterKeyToCollisionTagSlug(key);
  if (fromKey) return fromKey;
  const set = new Set((opts.tags ?? []).map((t) => String(t).trim().toLowerCase()));
  for (const c of COLLISION_CLUSTER_TAG_SLUGS) {
    if (set.has(c)) return c;
  }
  return null;
}

export function clusterTagSlugToSemanticLabel(clusterTagSlug: string): string {
  const u = clusterTagSlug.trim().toLowerCase();
  if (u === BLOG_TAG_CLUSTER_BOOKING_CONFIDENCE) return SEMANTIC_CLUSTER_BOOKING_CONFIDENCE;
  if (u === BLOG_TAG_CLUSTER_SERVICE_SELECTION) return SEMANTIC_CLUSTER_SERVICE_SELECTION;
  return u;
}

export function semanticClusterIsBookingConfidence(opts: {
  semanticCluster?: string | null;
  tags?: string[] | null;
}): boolean {
  return (
    resolveSemanticClusterKey({
      persisted: opts.semanticCluster,
      tags: opts.tags ?? [],
    }) === SEMANTIC_CLUSTER_BOOKING_CONFIDENCE
  );
}

/** Combined block for prompts, CMS notes, or future validators. */
export const BLOG_SEO_GOVERNANCE = {
  pricingHubLinking: PRICING_HUB_LINKING_GOVERNANCE,
  primaryIntentPerUrl: PRIMARY_INTENT_PER_URL_GOVERNANCE,
  clusterMembership: CLUSTER_MEMBERSHIP_GOVERNANCE,
} as const;
