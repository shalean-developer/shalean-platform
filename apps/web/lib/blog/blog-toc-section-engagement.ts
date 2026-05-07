import { BLOG_TOC_ACTIVE_EVENT } from "@/lib/blog/blog-toc-active-event";
import { inferHeadingIntentType } from "@/lib/blog/infer-heading-intent-type";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

type Pending = {
  slug: string;
  heading_id: string;
  heading_label: string;
  heading_depth: number;
  startedAt: number;
  maxScrollPct: number;
  nextSectionReached: boolean;
};

/** Immutable snapshot of the active TOC engagement session at CTA click time (same slug only). */
export type BlogTocEngagementCtaSnapshot = {
  last_engaged_heading_id: string;
  last_engaged_heading_label: string;
  last_engaged_heading_depth: number;
  engagement_completion_bucket: string;
  engagement_max_scroll_pct: number;
  time_since_heading_engagement_ms: number;
  heading_next_section_reached: boolean;
  heading_flush_state: "active";
  heading_intent_type: string | null;
};

/** Pure builder for tests and for `getCurrentTocEngagementSnapshot`. */
export function buildBlogTocCtaEngagementSnapshot(p: Pending, nowMs: number): BlogTocEngagementCtaSnapshot {
  const maxPct = Math.round(p.maxScrollPct);
  return {
    last_engaged_heading_id: p.heading_id,
    last_engaged_heading_label: p.heading_label,
    last_engaged_heading_depth: p.heading_depth,
    engagement_completion_bucket: completionBucketFromScrollPct(p.maxScrollPct),
    engagement_max_scroll_pct: maxPct,
    time_since_heading_engagement_ms: Math.round(nowMs - p.startedAt),
    heading_next_section_reached: p.nextSectionReached,
    heading_flush_state: "active",
    heading_intent_type: inferHeadingIntentType(p.heading_label, p.heading_id),
  };
}

/**
 * Read-only view of the pending TOC engagement session for the given post slug.
 * Call synchronously when `blog_cta_click` fires — captures live scroll + progression, not flush-time state.
 */
export function getCurrentTocEngagementSnapshot(slug: string): BlogTocEngagementCtaSnapshot | null {
  if (typeof performance === "undefined") return null;
  if (!pending || pending.slug !== slug) return null;
  return buildBlogTocCtaEngagementSnapshot(pending, performance.now());
}

let pending: Pending | null = null;
let listenersAttached = false;

export function completionBucketFromScrollPct(pct: number): string {
  if (pct >= 100) return "100";
  if (pct >= 75) return "75_99";
  if (pct >= 50) return "50_74";
  if (pct >= 25) return "25_49";
  return "lt_25";
}

function flush(reason: "leave" | "superseded"): void {
  if (!pending) return;
  const p = pending;
  pending = null;
  const time_after_click_ms = Math.round(performance.now() - p.startedAt);
  const max_scroll_after_click_pct = Math.round(p.maxScrollPct);
  trackGrowthEvent("blog_toc_section_engagement", {
    slug: p.slug,
    heading_id: p.heading_id,
    heading_label: p.heading_label,
    heading_depth: p.heading_depth,
    toc_clicked: true,
    max_scroll_after_click_pct,
    time_after_click_ms,
    reached_article_end: max_scroll_after_click_pct >= 95,
    next_heading_reached: p.nextSectionReached,
    completion_bucket: completionBucketFromScrollPct(p.maxScrollPct),
    flush_reason: reason,
  });
}

function onScrollspyActive(e: Event): void {
  if (!pending) return;
  // Ignore early events while smooth-scroll / layout settles after a TOC jump.
  if (performance.now() - pending.startedAt < 450) return;
  const ce = e as CustomEvent<{ activeId?: string }>;
  const id = ce.detail?.activeId;
  if (typeof id !== "string" || id.length === 0) return;
  if (id !== pending.heading_id) pending.nextSectionReached = true;
}

function ensureListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  const onLeave = () => flush("leave");
  window.addEventListener("pagehide", onLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onLeave();
  });
  window.addEventListener(BLOG_TOC_ACTIVE_EVENT, onScrollspyActive);
}

/**
 * Call after `blog_toc_click` when the reader chose a TOC target — starts a session for completion correlation.
 */
export function recordTocSectionEngagementFromTocClick(
  slug: string,
  item: { id: string; label: string; level: number },
): void {
  ensureListeners();
  if (pending) flush("superseded");
  pending = {
    slug,
    heading_id: item.id,
    heading_label: item.label,
    heading_depth: item.level,
    startedAt: performance.now(),
    maxScrollPct: 0,
    nextSectionReached: false,
  };
}

/** Document-level read % (0–100), same basis as `blog_scroll` depth in `BlogEngagementAnalytics`. */
export function updateTocSectionEngagementScrollPct(slug: string, docScrollPct: number): void {
  if (!pending || pending.slug !== slug) return;
  pending.maxScrollPct = Math.max(pending.maxScrollPct, docScrollPct);
}

/** Invoke from article analytics cleanup / route changes so the last TOC intent is not dropped. */
export function flushTocSectionEngagementForLeave(): void {
  flush("leave");
}
