/**
 * Shadow comparison: **booking-derived card slice** vs **`cleaner_earnings` rows** for the same booking ids.
 * Used to detect drift before `source_of_truth` flips from `"booking"` to `"ledger"`.
 */

import { earningsPeriodBucketYmd, type EarningsPeriodBucketInput } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { getJhbWeekBounds } from "@/lib/cleaner/earnings/weekBounds";

export type LedgerRowForShadow = {
  booking_id: string;
  amount_cents: number;
  status: string;
};

export type PayoutCardRowForShadow = {
  booking_id: string;
  amount_cents: number;
  payout_status: string;
  in_frozen_batch?: boolean;
  is_team_job?: boolean;
  /** When set, solo line earnings are considered “expected” on ledger (missing row is suspicious). */
  cleaner_earnings_total_cents?: number | null;
  /** ISO or `YYYY-MM-DD` — used for soft vs hard missing-ledger split. */
  primary_completion_at_iso?: string | null;
};

export type EarningsShadowBucketTotals = {
  pending_cents: number;
  eligible_cents: number;
  paid_cents: number;
  invalid_cents: number;
  frozen_batch_cents: number;
  all_cents: number;
};

export type LedgerShadowBucketTotals = {
  pending_cents: number;
  approved_cents: number;
  paid_cents: number;
  all_cents: number;
};

/** Always `card − ledger` for `delta_all_cents` and per-bucket deltas in the public summary. */
export const EARNINGS_SHADOW_DELTA_DIRECTION = "card_minus_ledger" as const;

export type EarningsFinanceShadowPublicSummary = {
  ok: boolean;
  delta_all_cents: number;
  delta_direction: typeof EARNINGS_SHADOW_DELTA_DIRECTION;
  missing_ledger_expected_count: number;
  missing_ledger_expected_count_soft: number;
  missing_ledger_expected_count_hard: number;
  bucket_mapping_mismatch_count: number;
  buckets: {
    pending_delta: number;
    eligible_delta: number;
    paid_delta: number;
  };
};

export type EarningsFinanceShadowPayload = {
  booking_ids_in_slice: number;
  card: EarningsShadowBucketTotals;
  ledger: LedgerShadowBucketTotals;
  /** `card.all_cents - ledger.all_cents` for rows in slice (ledger missing counts as 0). */
  delta_all_cents: number;
  /** Always `card_minus_ledger` — see {@link EARNINGS_SHADOW_DELTA_DIRECTION}. */
  delta_direction: typeof EARNINGS_SHADOW_DELTA_DIRECTION;
  /** `pending`/`eligible`/`paid` align when mapping ledger `approved` → UI `eligible` (invalid/frozen are card-only). */
  bucket_aligned: boolean;
  /** Solo slice rows with positive card cents, finalized `cleaner_earnings_total_cents`, and no ledger row. */
  missing_ledger_expected_count: number;
  /** Missing rows whose completion is newer than {@link EarningsFinanceShadowOptions.missingLedgerHardAfterMs} (async lag). */
  missing_ledger_expected_count_soft: number;
  /** Missing rows older than the soft window — alert on these. */
  missing_ledger_expected_count_hard: number;
  /** Same booking has ledger + card but normalized card bucket ≠ ledger status (approved↔eligible mapping). */
  bucket_mapping_mismatch_count: number;
  /** True when bucket alignment fails or absolute delta on all cents is non-zero. */
  shadow_mismatch: boolean;
  /** Compact shape for dashboards / clients. */
  summary: EarningsFinanceShadowPublicSummary;
};

export type EarningsFinanceShadowOptions = {
  /** Wall time for missing-ledger age split; default `Date.now()`. */
  asOfMs?: number;
  /** Age above which a missing expected ledger row is “hard” (default 12 minutes). */
  missingLedgerHardAfterMs?: number;
};

function cents(n: unknown): number {
  return Math.max(0, Math.round(Number(n) || 0));
}

function ledgerRowsForBookings(
  allLedger: readonly LedgerRowForShadow[],
  bookingIds: ReadonlySet<string>,
): LedgerRowForShadow[] {
  const out: LedgerRowForShadow[] = [];
  for (const r of allLedger) {
    const bid = String(r.booking_id ?? "").trim();
    if (bid && bookingIds.has(bid)) out.push(r);
  }
  return out;
}

function ledgerAmountByBookingId(rows: readonly LedgerRowForShadow[]): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const bid = String(r.booking_id ?? "").trim();
    if (!bid) continue;
    m.set(bid, cents(r.amount_cents));
  }
  return m;
}

function ledgerStatusByBookingId(rows: readonly LedgerRowForShadow[]): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const bid = String(r.booking_id ?? "").trim();
    if (!bid) continue;
    m.set(bid, String(r.status ?? "").trim().toLowerCase());
  }
  return m;
}

/**
 * Map normalized card payout_status (+ frozen batch) to expected `cleaner_earnings.status`.
 * Frozen batch: eligible/paid on the card are treated as ledger `approved` (payout frozen, not yet paid out).
 */
function expectedLedgerStatusFromCard(c: PayoutCardRowForShadow): string | null {
  const ps = String(c.payout_status ?? "").trim().toLowerCase();
  if (ps === "invalid") return null;
  if (c.in_frozen_batch) {
    if (ps === "eligible" || ps === "paid") return "approved";
    if (ps === "pending") return "pending";
    return null;
  }
  if (ps === "pending") return "pending";
  if (ps === "eligible") return "approved";
  if (ps === "paid") return "paid";
  return null;
}

function completionAgeMs(card: PayoutCardRowForShadow, asOfMs: number): number | null {
  const raw = card.primary_completion_at_iso;
  if (raw == null || !String(raw).trim()) return null;
  const ms = Date.parse(String(raw));
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, asOfMs - ms);
}

export type EarningsFinanceShadowCore = Omit<EarningsFinanceShadowPayload, "summary">;

/** Single go/no-go for flipping `GET /api/cleaner/earnings` summary totals to ledger (server still gates via `USE_LEDGER_TOTALS`). */
export function isEarningsLedgerFlipReady(
  s: Pick<
    EarningsFinanceShadowPayload,
    | "shadow_mismatch"
    | "missing_ledger_expected_count_hard"
    | "bucket_mapping_mismatch_count"
    | "delta_all_cents"
  >,
): boolean {
  return (
    !s.shadow_mismatch &&
    s.missing_ledger_expected_count_hard === 0 &&
    s.bucket_mapping_mismatch_count === 0 &&
    s.delta_all_cents === 0
  );
}

export function buildFinanceShadowPublicSummary(s: EarningsFinanceShadowCore): EarningsFinanceShadowPublicSummary {
  return {
    ok: !s.shadow_mismatch,
    delta_all_cents: s.delta_all_cents,
    delta_direction: s.delta_direction,
    missing_ledger_expected_count: s.missing_ledger_expected_count,
    missing_ledger_expected_count_soft: s.missing_ledger_expected_count_soft,
    missing_ledger_expected_count_hard: s.missing_ledger_expected_count_hard,
    bucket_mapping_mismatch_count: s.bucket_mapping_mismatch_count,
    buckets: {
      pending_delta: s.card.pending_cents - s.ledger.pending_cents,
      eligible_delta: s.card.eligible_cents - s.ledger.approved_cents,
      paid_delta: s.card.paid_cents - s.ledger.paid_cents,
    },
  };
}

/**
 * Restrict payout cards to the current **Johannesburg ISO week** (Mon–Sun), using the same bucket YMD as period totals.
 */
export function filterPayoutCardsForJhbIsoWeek(
  cards: readonly PayoutCardRowForShadow[],
  now: Date = new Date(),
): PayoutCardRowForShadow[] {
  const { startYmd, endYmd } = getJhbWeekBounds(now);
  const out: PayoutCardRowForShadow[] = [];
  for (const c of cards) {
    const row: EarningsPeriodBucketInput = {
      completed_at: c.primary_completion_at_iso ?? null,
      schedule_date: null,
    };
    const d = earningsPeriodBucketYmd(row);
    if (!d || d < startYmd || d > endYmd) continue;
    out.push(c);
  }
  return out;
}

/**
 * Aggregate booking cards vs ledger rows **restricted to the same booking id set** (typically the earnings API’s
 * last-300 completed slice), plus soft/hard missing-ledger split and bucket-mapping guard.
 */
export function computeEarningsFinanceShadow(
  cards: readonly PayoutCardRowForShadow[],
  allLedgerRows: readonly LedgerRowForShadow[],
  opts?: EarningsFinanceShadowOptions,
): EarningsFinanceShadowPayload {
  const asOfMs = typeof opts?.asOfMs === "number" && Number.isFinite(opts.asOfMs) ? opts.asOfMs : Date.now();
  const hardAfterMs =
    typeof opts?.missingLedgerHardAfterMs === "number" && Number.isFinite(opts.missingLedgerHardAfterMs)
      ? Math.max(60_000, opts.missingLedgerHardAfterMs)
      : 12 * 60 * 1000;

  const bookingIds = new Set(cards.map((c) => String(c.booking_id ?? "").trim()).filter(Boolean));
  const sliceLedger = ledgerRowsForBookings(allLedgerRows, bookingIds);
  const ledgerByBooking = ledgerAmountByBookingId(sliceLedger);
  const ledgerStatusByBooking = ledgerStatusByBookingId(sliceLedger);

  const card: EarningsShadowBucketTotals = {
    pending_cents: 0,
    eligible_cents: 0,
    paid_cents: 0,
    invalid_cents: 0,
    frozen_batch_cents: 0,
    all_cents: 0,
  };

  let missing_ledger_expected_count_soft = 0;
  let missing_ledger_expected_count_hard = 0;
  let bucket_mapping_mismatch_count = 0;

  for (const c of cards) {
    const bid = String(c.booking_id ?? "").trim();
    if (!bid) continue;
    const amount = cents(c.amount_cents);
    const ps = String(c.payout_status ?? "").trim().toLowerCase();
    card.all_cents += amount;
    if (c.in_frozen_batch) {
      card.frozen_batch_cents += amount;
    } else if (ps === "pending") card.pending_cents += amount;
    else if (ps === "eligible") card.eligible_cents += amount;
    else if (ps === "paid") card.paid_cents += amount;
    else if (ps === "invalid") card.invalid_cents += amount;

    const hasLedger = ledgerByBooking.has(bid);
    if (
      !hasLedger &&
      amount > 0 &&
      !c.is_team_job &&
      c.cleaner_earnings_total_cents != null &&
      Number.isFinite(Number(c.cleaner_earnings_total_cents))
    ) {
      const age = completionAgeMs(c, asOfMs);
      if (age == null || age > hardAfterMs) missing_ledger_expected_count_hard += 1;
      else missing_ledger_expected_count_soft += 1;
    }

    if (hasLedger) {
      const exp = expectedLedgerStatusFromCard(c);
      const act = ledgerStatusByBooking.get(bid);
      if (exp && act && act !== exp) bucket_mapping_mismatch_count += 1;
    }
  }

  const ledger: LedgerShadowBucketTotals = {
    pending_cents: 0,
    approved_cents: 0,
    paid_cents: 0,
    all_cents: 0,
  };
  for (const r of sliceLedger) {
    const amount = cents(r.amount_cents);
    ledger.all_cents += amount;
    const st = String(r.status ?? "").trim().toLowerCase();
    if (st === "pending") ledger.pending_cents += amount;
    else if (st === "approved") ledger.approved_cents += amount;
    else if (st === "paid") ledger.paid_cents += amount;
  }

  const delta_all_cents = card.all_cents - ledger.all_cents;
  const bucket_aligned =
    card.pending_cents === ledger.pending_cents &&
    card.eligible_cents === ledger.approved_cents &&
    card.paid_cents === ledger.paid_cents;

  const missing_ledger_expected_count = missing_ledger_expected_count_soft + missing_ledger_expected_count_hard;
  /** Hard missing is surfaced via `missing_ledger_expected_count_hard` + metrics — not folded into `shadow_mismatch` (delta already reflects ledger gap). */
  const shadow_mismatch = !bucket_aligned || delta_all_cents !== 0 || bucket_mapping_mismatch_count > 0;

  const core: EarningsFinanceShadowCore = {
    booking_ids_in_slice: bookingIds.size,
    card,
    ledger,
    delta_all_cents,
    delta_direction: EARNINGS_SHADOW_DELTA_DIRECTION,
    bucket_aligned,
    missing_ledger_expected_count,
    missing_ledger_expected_count_soft,
    missing_ledger_expected_count_hard,
    bucket_mapping_mismatch_count,
    shadow_mismatch,
  };
  return { ...core, summary: buildFinanceShadowPublicSummary(core) };
}
