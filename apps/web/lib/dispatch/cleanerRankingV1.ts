/**
 * Explicit V1 marketplace ranking (no ML): weighted acceptance, completion,
 * cancellation, response sluggishness, and job recency. Intended to be blended
 * into `findSmartDispatchCandidates` — distance/travel stay in dispatch v4.
 */

export type CleanerTerminalBookingRow = {
  cleaner_id?: string | null;
  status?: string | null;
  completed_at?: string | null;
  /** When status = cancelled, limits ranking penalties to cleaner-initiated cancels. */
  cancelled_by?: string | null;
};

export type CleanerRankingWindowDerived = {
  completionRate: number;
  cancellationRate: number;
  recency01: number;
};

const PRIOR_TERMINAL = 3;
const PRIOR_COMP = 2.4; // ~80% completion prior
const PRIOR_CLEANER_CANCEL = 0.15; // ~5% cleaner-cancel prior on shared denominator

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function isCleanerCancelledBooking(row: CleanerTerminalBookingRow): boolean {
  const st = String(row.status ?? "").toLowerCase();
  if (st !== "cancelled") return false;
  return String(row.cancelled_by ?? "").toLowerCase() === "cleaner";
}

/**
 * Maps offer response EWMA (ms) to [0,1]: 0 = fast, 1 = very slow.
 */
export function responsePenalty01FromAvgMs(avgMs: number | null | undefined): number {
  if (avgMs == null || !Number.isFinite(avgMs) || avgMs <= 0) return 0.12;
  return clamp01(avgMs / 240_000);
}

/**
 * Bonus from last completed job (wall-clock), 0–1.
 */
export function recency01FromLastCompletedAt(lastCompletedIso: string | null): number {
  if (!lastCompletedIso) return 0.25;
  const t = new Date(lastCompletedIso).getTime();
  if (!Number.isFinite(t)) return 0.25;
  const days = (Date.now() - t) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 0.25;
  if (days <= 2) return 1;
  if (days <= 7) return 0.85;
  if (days <= 21) return 0.65;
  if (days <= 45) return 0.45;
  return Math.max(0.12, 0.45 - (days - 45) / 120);
}

/**
 * Per-cleaner stats from recent terminal bookings (same window as the query).
 */
export function buildCleanerRankingWindowStats(
  rows: CleanerTerminalBookingRow[],
  cleanerIds: readonly string[],
): Map<string, CleanerRankingWindowDerived> {
  const byCleaner = new Map<
    string,
    { nComp: number; nCleanerCancel: number; nFail: number; lastCompletedMs: number | null }
  >();

  for (const id of cleanerIds) {
    byCleaner.set(id, { nComp: 0, nCleanerCancel: 0, nFail: 0, lastCompletedMs: null });
  }

  for (const raw of rows) {
    const cid = String(raw.cleaner_id ?? "").trim();
    if (!cid || !byCleaner.has(cid)) continue;
    const bucket = byCleaner.get(cid)!;
    const st = String(raw.status ?? "").toLowerCase();
    if (st === "completed") {
      bucket.nComp++;
      const ca = raw.completed_at;
      if (ca) {
        const ms = new Date(ca).getTime();
        if (Number.isFinite(ms)) {
          bucket.lastCompletedMs =
            bucket.lastCompletedMs == null ? ms : Math.max(bucket.lastCompletedMs, ms);
        }
      }
    } else if (isCleanerCancelledBooking(raw)) {
      bucket.nCleanerCancel++;
    } else if (st === "failed") bucket.nFail++;
  }

  const out = new Map<string, CleanerRankingWindowDerived>();
  for (const id of cleanerIds) {
    const b = byCleaner.get(id)!;
    /** Customer/system/legacy cancels excluded — only completed, failed, cleaner-cancel shape ranking. */
    const denom = b.nComp + b.nCleanerCancel + b.nFail + PRIOR_TERMINAL;
    const completionRate = clamp01((b.nComp + PRIOR_COMP) / denom);
    const cancellationRate = clamp01((b.nCleanerCancel + PRIOR_CLEANER_CANCEL) / denom);
    const lastIso =
      b.lastCompletedMs != null && Number.isFinite(b.lastCompletedMs)
        ? new Date(b.lastCompletedMs).toISOString()
        : null;
    out.set(id, {
      completionRate,
      cancellationRate,
      recency01: recency01FromLastCompletedAt(lastIso),
    });
  }
  return out;
}

/**
 * Weighted bundle per product spec (each factor already 0–1 where applicable).
 */
export function computeCleanerRankingV1Bundle(input: {
  acceptanceRate: number;
  completionRate: number;
  cancellationRate: number;
  responsePenalty01: number;
  recency01: number;
}): number {
  const a = clamp01(input.acceptanceRate);
  const c = clamp01(input.completionRate);
  const x = clamp01(input.cancellationRate);
  const r = clamp01(input.responsePenalty01);
  const z = clamp01(input.recency01);
  return a * 0.35 + c * 0.25 - x * 0.2 - r * 0.1 + z * 0.1;
}

/** Neutral-ish bundle for mid performers; used to center the additive dispatch term. */
export const CLEANER_RANKING_V1_NEUTRAL_BUNDLE = computeCleanerRankingV1Bundle({
  acceptanceRate: 0.78,
  completionRate: 0.82,
  cancellationRate: 0.06,
  responsePenalty01: 0.15,
  recency01: 0.5,
});

const DEFAULT_RANKING_V1_WEIGHT = 8;

export function rankingV1DispatchAdjustment(bundle: number): number {
  const wRaw = process.env.DISPATCH_RANKING_V1_WEIGHT?.trim();
  const w =
    wRaw != null && wRaw !== "" && Number.isFinite(Number(wRaw)) ? Number(wRaw) : DEFAULT_RANKING_V1_WEIGHT;
  if (!Number.isFinite(w) || w === 0) return 0;
  return (bundle - CLEANER_RANKING_V1_NEUTRAL_BUNDLE) * w;
}
