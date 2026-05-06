import { WARN_SEMANTIC_OVERLAP_CLUSTER } from "@/lib/seo/blogGovernance";

/** Stable ids for overlap heuristics (logs, UI detail, future tuning). */
export const OVERLAP_SIGNAL_PRIMARY_KEYWORD_MULTISET = "primary_keyword_multiset";
export const OVERLAP_SIGNAL_SLUG_TOKEN_JACCARD = "slug_token_jaccard";
export const OVERLAP_SIGNAL_TITLE_TOKEN_JACCARD = "title_token_jaccard";
export const OVERLAP_SIGNAL_INTENT_PHRASE_SHARED = "intent_phrase_shared";

const OVERLAP_SIGNAL_ORDER = [
  OVERLAP_SIGNAL_PRIMARY_KEYWORD_MULTISET,
  OVERLAP_SIGNAL_SLUG_TOKEN_JACCARD,
  OVERLAP_SIGNAL_TITLE_TOKEN_JACCARD,
  OVERLAP_SIGNAL_INTENT_PHRASE_SHARED,
] as const;

export type ClusterPeerPost = {
  slug: string;
  title: string;
  primary_keyword: string | null;
  /** Present when selected from the database (stable sort for related guides). */
  published_at?: string | null;
};

export type OverlapConfidence = "low" | "medium" | "high";

export type PublishOverlapContext = {
  slug: string;
  title: string;
  primary_keyword: string | null;
  /** Human-readable cluster (e.g. booking-confidence) for warning metadata. */
  semanticClusterLabel: string;
  peers: ClusterPeerPost[];
};

const TITLE_STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "in",
  "on",
  "at",
  "of",
  "vs",
  "v",
  "your",
  "our",
  "how",
  "what",
  "when",
  "why",
  "with",
  "from",
  "is",
  "are",
  "by",
  "it",
  "we",
  "you",
  "this",
  "that",
]);

/** Short phrases that often indicate competing intents within a cluster. */
const INTENT_SIGNALS = [
  "same-day",
  "same day",
  "how long",
  "how much",
  "included",
  "recurring",
  "once-off",
  "once off",
  " vs ",
  " versus",
  "deep clean",
  "standard clean",
  "prices",
  "rates",
  "cost",
  "checklist",
  "prepare",
  "which",
  "one should",
] as const;

function slugTokens(slug: string): Set<string> {
  return new Set(
    slug
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((s) => s.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function titleTokens(title: string): Set<string> {
  const raw = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !TITLE_STOP.has(t));
  return new Set(raw);
}

function keywordMultisetKey(s: string | null | undefined): string | null {
  if (s == null) return null;
  const parts = s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .sort();
  return parts.length ? parts.join(" ") : null;
}

function sharedIntentSignalCount(leftBlob: string, rightBlob: string): number {
  const L = leftBlob.toLowerCase();
  const R = rightBlob.toLowerCase();
  let n = 0;
  for (const sig of INTENT_SIGNALS) {
    if (L.includes(sig) && R.includes(sig)) n += 1;
  }
  return n;
}

function overlapConfidence(params: {
  slugJ: number;
  titleJ: number;
  kwMatch: boolean;
  sharedSignals: number;
}): OverlapConfidence | null {
  const { slugJ, titleJ, kwMatch, sharedSignals } = params;
  if (kwMatch) return "high";
  if (slugJ >= 0.72) return "high";
  if (slugJ >= 0.5 && titleJ >= 0.45) return "high";
  if (titleJ >= 0.58) return "medium";
  if (slugJ >= 0.42 && titleJ >= 0.38) return "medium";
  if (sharedSignals >= 1 && titleJ >= 0.42) return "medium";
  if (titleJ >= 0.32 && sharedSignals >= 2) return "low";
  if (slugJ >= 0.38 && titleJ >= 0.28) return "low";
  return null;
}

function shouldEmitWarning(confidence: OverlapConfidence, sharedSignals: number): boolean {
  if (confidence === "high" || confidence === "medium") return true;
  return confidence === "low" && sharedSignals >= 2;
}

/** Which detectors fired above explainability thresholds (not raw scores). */
function collectMatchedSignals(args: {
  kwMatch: boolean;
  slugJ: number;
  titleJ: number;
  sharedSignals: number;
}): string[] {
  const hit = new Set<string>();
  if (args.kwMatch) hit.add(OVERLAP_SIGNAL_PRIMARY_KEYWORD_MULTISET);
  if (args.slugJ >= 0.32) hit.add(OVERLAP_SIGNAL_SLUG_TOKEN_JACCARD);
  if (args.titleJ >= 0.26) hit.add(OVERLAP_SIGNAL_TITLE_TOKEN_JACCARD);
  if (args.sharedSignals >= 1) hit.add(OVERLAP_SIGNAL_INTENT_PHRASE_SHARED);
  return OVERLAP_SIGNAL_ORDER.filter((s) => hit.has(s));
}

/**
 * Warn-only: same-cluster published peers vs draft/publish candidate (heuristic, no embeddings).
 */
export function collectClusterSemanticOverlapWarnings(ctx: PublishOverlapContext): Array<{
  code: string;
  message: string;
  confidence: OverlapConfidence;
  relatedSlug: string;
  semanticCluster?: string;
  matchedSignals: string[];
}> {
  const out: Array<{
    code: string;
    message: string;
    confidence: OverlapConfidence;
    relatedSlug: string;
    semanticCluster?: string;
    matchedSignals: string[];
  }> = [];
  const subjectSlug = ctx.slug.trim().toLowerCase();
  const subjectTitle = ctx.title.trim();
  const subjectPk = ctx.primary_keyword;

  for (const peer of ctx.peers) {
    const peerSlug = peer.slug.trim().toLowerCase();
    if (!peerSlug || peerSlug === subjectSlug) continue;

    const slugJ = jaccard(slugTokens(ctx.slug), slugTokens(peer.slug));
    const titleJ = jaccard(titleTokens(subjectTitle), titleTokens(peer.title));
    const kwMatch =
      Boolean(keywordMultisetKey(subjectPk)) &&
      keywordMultisetKey(subjectPk) === keywordMultisetKey(peer.primary_keyword);
    const blobSubject = `${ctx.slug} ${subjectTitle}`;
    const blobPeer = `${peer.slug} ${peer.title}`;
    const sharedSignals = sharedIntentSignalCount(blobSubject, blobPeer);

    const confidence = overlapConfidence({ slugJ, titleJ, kwMatch, sharedSignals });
    if (!confidence || !shouldEmitWarning(confidence, sharedSignals)) continue;

    const matchedSignals = collectMatchedSignals({ kwMatch, slugJ, titleJ, sharedSignals });

    out.push({
      code: WARN_SEMANTIC_OVERLAP_CLUSTER,
      message: `Possible semantic overlap with an existing published article in the same cluster (“${peer.title}”, /blog/${peer.slug}). Review intent differentiation and internal linking strategy before publishing.`,
      confidence,
      relatedSlug: peer.slug,
      semanticCluster: ctx.semanticClusterLabel,
      matchedSignals,
    });
  }

  return out;
}
