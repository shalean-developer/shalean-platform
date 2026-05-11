/**
 * Pure helper for computing newly-arrived offer IDs across two snapshots.
 *
 * Used by `useCleanerDashboardData` to fire `navigator.vibrate` (and any
 * future auto-open modal sheet) exactly once per new offer that arrives via
 * realtime / polling, even when SMS notification has failed.
 *
 * Hydration-safe: callers pass `isFirstHydration: true` on the first
 * post-loading tick to suppress the entire snapshot from being treated as
 * "new arrivals" — otherwise the dispatcher would buzz the device every
 * time the cleaner re-opens the dashboard.
 */
export type DetectNewOfferArrivalsInput = {
  previousIds: ReadonlySet<string>;
  currentIds: ReadonlyArray<string>;
  isFirstHydration: boolean;
  /**
   * When true, the cleaner is online + receiving offers + the tab is visible.
   * If false, IDs still update but `newIds` is returned empty — we do not
   * want haptic feedback for offers the cleaner cannot act on.
   */
  shouldSurface: boolean;
};

export type DetectNewOfferArrivalsResult = {
  /** New offer IDs vs the previous snapshot — empty during first hydration or when not surfacing. */
  newIds: string[];
  /** The next `previousIds` to remember for the following tick. */
  nextPreviousIds: Set<string>;
};

export function detectNewOfferArrivals(input: DetectNewOfferArrivalsInput): DetectNewOfferArrivalsResult {
  const dedupedCurrent = new Set<string>();
  for (const id of input.currentIds) {
    const trimmed = String(id ?? "").trim();
    if (trimmed) dedupedCurrent.add(trimmed);
  }
  if (input.isFirstHydration) {
    return { newIds: [], nextPreviousIds: dedupedCurrent };
  }
  if (!input.shouldSurface) {
    return { newIds: [], nextPreviousIds: dedupedCurrent };
  }
  const newIds: string[] = [];
  for (const id of dedupedCurrent) {
    if (!input.previousIds.has(id)) newIds.push(id);
  }
  return { newIds, nextPreviousIds: dedupedCurrent };
}
