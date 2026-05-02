/**
 * Shadow comparison: **booking-derived card slice** vs **`cleaner_earnings` rows** for the same booking ids.
 * Used to detect drift before `source_of_truth` flips from `"booking"` to `"ledger"`.
 */

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

export type EarningsFinanceShadowPayload = {
  booking_ids_in_slice: number;
  card: EarningsShadowBucketTotals;
  ledger: LedgerShadowBucketTotals;
  /** `card.all_cents - ledger.all_cents` for rows in slice (ledger missing counts as 0). */
  delta_all_cents: number;
  /** `pending`/`eligible`/`paid` align when mapping ledger `approved` → UI `eligible` (invalid/frozen are card-only). */
  bucket_aligned: boolean;
  /** Solo slice rows with positive card cents, finalized `cleaner_earnings_total_cents`, and no ledger row. */
  missing_ledger_expected_count: number;
  /** True when bucket alignment fails or absolute delta on all cents is non-zero. */
  shadow_mismatch: boolean;
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

/**
 * Aggregate booking cards vs ledger rows **restricted to the same booking id set** (typically the earnings API’s
 * last-300 completed slice).
 */
export function computeEarningsFinanceShadow(
  cards: readonly PayoutCardRowForShadow[],
  allLedgerRows: readonly LedgerRowForShadow[],
): EarningsFinanceShadowPayload {
  const bookingIds = new Set(cards.map((c) => String(c.booking_id ?? "").trim()).filter(Boolean));
  const sliceLedger = ledgerRowsForBookings(allLedgerRows, bookingIds);
  const ledgerByBooking = ledgerAmountByBookingId(sliceLedger);

  const card: EarningsShadowBucketTotals = {
    pending_cents: 0,
    eligible_cents: 0,
    paid_cents: 0,
    invalid_cents: 0,
    frozen_batch_cents: 0,
    all_cents: 0,
  };

  let missing_ledger_expected_count = 0;

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
      missing_ledger_expected_count += 1;
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

  const shadow_mismatch = !bucket_aligned || delta_all_cents !== 0;

  return {
    booking_ids_in_slice: bookingIds.size,
    card,
    ledger,
    delta_all_cents,
    bucket_aligned,
    missing_ledger_expected_count,
    shadow_mismatch,
  };
}
