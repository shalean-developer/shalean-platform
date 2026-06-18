/**
 * Pure helpers for `CleanerBottomNav` badge rendering.
 *
 * Extracted so we can unit-test the badge contract (label, kind, aria text)
 * without spinning up a JSX renderer — the cleaner-portal vitest config only
 * runs `.test.ts` under `lib/**`.
 */

export type CleanerNavTabBadgeKind = "jobs" | "offers";

export type CleanerNavTabBadge = {
  count: number;
  kind: CleanerNavTabBadgeKind;
};

const TAB_BADGE_BY_HREF: Record<string, CleanerNavTabBadgeKind> = {
  "/jobs/list": "jobs",
  "/cleaner/jobs": "jobs",
  "/jobs": "offers",
  "/cleaner/dashboard": "offers",
};

/**
 * Returns the badge to render on the given bottom-nav tab, or null if no
 * badge is appropriate. Counts are clamped to a non-negative integer; zero
 * collapses to no badge.
 */
export function pickCleanerNavTabBadge(args: {
  href: string;
  openJobsCount: number;
  pendingOffersCount: number;
}): CleanerNavTabBadge | null {
  const kind = TAB_BADGE_BY_HREF[args.href];
  if (!kind) return null;
  const raw = kind === "jobs" ? args.openJobsCount : args.pendingOffersCount;
  const count = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  if (count <= 0) return null;
  return { count, kind };
}

/** Cap badge text at "9+" so it never overflows the nav cell. */
export function cleanerNavBadgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 9 ? "9+" : String(Math.floor(count));
}

/** Accessible aria label so screen readers announce *why* there's a badge. */
export function cleanerNavTabAriaLabel(label: string, badge: CleanerNavTabBadge | null): string {
  if (!badge) return label;
  if (badge.kind === "offers") {
    return `${label} — ${badge.count} new ${badge.count === 1 ? "offer" : "offers"} waiting`;
  }
  return `${label} — ${badge.count} ${badge.count === 1 ? "open job" : "open jobs"}`;
}
