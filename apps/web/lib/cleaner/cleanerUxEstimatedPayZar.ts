/**
 * Display-only pay hints when frozen/API earnings are not on the row yet.
 * Does not affect payout, settlement, or server-side earnings.
 */

export const CLEANER_UX_EARNINGS_CAP_MIN_ZAR = 250;
export const CLEANER_UX_EARNINGS_CAP_MAX_ZAR = 350;

const NEW_CLEANER_RATE = 0.6;
const OLD_CLEANER_RATE = 0.7;

function clampZar(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** True when the cleaner profile is at least four calendar months old (Johannesburg-agnostic wall clock). */
export function cleanerIsExperiencedFourMonths(createdAtIso: string | null | undefined, now = new Date()): boolean {
  if (!createdAtIso?.trim()) return false;
  const t = new Date(createdAtIso).getTime();
  if (!Number.isFinite(t)) return false;
  const threshold = new Date(t);
  threshold.setMonth(threshold.getMonth() + 4);
  return now.getTime() >= threshold.getTime();
}

/**
 * Best-effort job total in ZAR from booking-shaped fields (cleaner jobs API / offer booking).
 */
export function jobTotalZarFromCleanerBookingLike(row: {
  total_paid_zar?: number | null;
  total_price?: number | string | null;
  amount_paid_cents?: number | null;
}): number | null {
  const tp = row.total_paid_zar;
  if (typeof tp === "number" && Number.isFinite(tp) && tp > 0) return tp;
  const pr = row.total_price;
  if (typeof pr === "number" && Number.isFinite(pr) && pr > 0) return pr;
  if (typeof pr === "string") {
    const n = Number.parseFloat(pr.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const cents = row.amount_paid_cents;
  if (typeof cents === "number" && Number.isFinite(cents) && cents > 0) return cents / 100;
  return null;
}

export type CleanerUxEstimatedPay =
  | { kind: "exact"; zar: number }
  | { kind: "range"; lowZar: number; highZar: number };

/**
 * Heuristic pay for empty-state UI: new cleaners &lt; 4 months → 60% of job total; else 70%.
 * Clamped to [250, 350] ZAR when job total is known; otherwise a fixed range (est.).
 */
export function cleanerUxEstimatedPayZar(
  cleanerCreatedAtIso: string | null | undefined,
  jobTotalZar: number | null,
  now = new Date(),
): CleanerUxEstimatedPay {
  const total =
    jobTotalZar != null && Number.isFinite(jobTotalZar) && jobTotalZar > 0 ? jobTotalZar : null;
  if (total != null) {
    const rate = cleanerIsExperiencedFourMonths(cleanerCreatedAtIso, now) ? OLD_CLEANER_RATE : NEW_CLEANER_RATE;
    const zar = Math.round(clampZar(rate * total, CLEANER_UX_EARNINGS_CAP_MIN_ZAR, CLEANER_UX_EARNINGS_CAP_MAX_ZAR));
    return { kind: "exact", zar };
  }
  return {
    kind: "range",
    lowZar: CLEANER_UX_EARNINGS_CAP_MIN_ZAR,
    highZar: CLEANER_UX_EARNINGS_CAP_MAX_ZAR,
  };
}

export function formatCleanerUxEstimatedPayRangeLabel(): string {
  return `R${CLEANER_UX_EARNINGS_CAP_MIN_ZAR}–R${CLEANER_UX_EARNINGS_CAP_MAX_ZAR} (est.)`;
}
