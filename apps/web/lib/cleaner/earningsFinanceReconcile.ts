/**
 * Finance consistency checks for cleaner earnings:
 *
 * - **Primary card/timeline** (`GET /api/cleaner/earnings` `rows[]`) is built from **bookings** payout fields
 *   via {@link resolveCleanerEarningsCents} — the operational source for “what the cleaner sees this week”.
 * - **`cleaner_earnings`** is the **per-booking ledger** (unique `booking_id`, idempotent insert). Amount is
 *   seeded from `bookings.cleaner_earnings_total_cents` when line items finalize; status uses `pending` |
 *   `approved` | `paid` (not the same string set as booking `payout_status`’s `eligible`).
 * - Therefore **ledger totals and card sums are not guaranteed byte-equal** until payout pipeline and line
 *   finalize are aligned; this module compares **intersection** (same booking ids) for drift detection.
 */

export type EarningsCardWire = {
  booking_id: string;
  amount_cents: number;
};

export type EarningsFinanceReconcile = {
  as_of: string;
  compared_bookings: number;
  /** Sum of all card `amount_cents` in the slice. */
  sum_card_cents: number;
  /** Sum of ledger `amount_cents` for booking ids present in the slice (missing rows contribute 0). */
  sum_ledger_cents_for_compared_bookings: number;
  /** Card row cents !== ledger row cents (same booking_id). */
  amount_mismatch_booking_count: number;
  /** Completed booking cards with no `cleaner_earnings` row (expected for team / unfinalized lines). */
  missing_ledger_row_count: number;
  /** Bookings where both card and ledger exist. */
  intersection_booking_count: number;
  /** Sum of card cents restricted to bookings that have a ledger row. */
  sum_card_intersection_cents: number;
  /** Sum of ledger cents restricted to the same intersection. */
  sum_ledger_intersection_cents: number;
  /** `sum_card_intersection_cents - sum_ledger_intersection_cents`. */
  delta_intersection_cents: number;
  /**
   * True when **intersection** amounts disagree (per-row mismatch or sum drift). With `strict`, missing ledger
   * rows (positive card cents) also fail.
   */
  invariant_failed: boolean;
  /** `!invariant_failed` (strict includes zero missing-ledger with positive card cents). */
  ok: boolean;
};

export type ReconcileEarningsOptions = {
  /** When true, `missing_ledger_row_count > 0` forces `invariant_failed` / `ok: false`. */
  strict?: boolean;
};

export function reconcileEarningsCardsWithLedger(
  cards: readonly EarningsCardWire[],
  ledgerAmountByBookingId: ReadonlyMap<string, number>,
  opts?: ReconcileEarningsOptions,
): EarningsFinanceReconcile {
  const strict = opts?.strict === true;
  const as_of = new Date().toISOString();
  let sumCard = 0;
  let sumLedgerInSlice = 0;
  let amount_mismatch_booking_count = 0;
  let missing_ledger_row_count = 0;
  let intersection_booking_count = 0;
  let sumCardIntersection = 0;
  let sumLedgerIntersection = 0;

  for (const c of cards) {
    const bid = c.booking_id.trim();
    if (!bid) continue;
    const cents = Math.max(0, Math.round(Number(c.amount_cents) || 0));
    sumCard += cents;
    const le = ledgerAmountByBookingId.get(bid);
    if (le === undefined) {
      if (cents > 0) missing_ledger_row_count += 1;
      continue;
    }
    sumLedgerInSlice += le;
    intersection_booking_count += 1;
    sumCardIntersection += cents;
    sumLedgerIntersection += le;
    if (le !== cents) amount_mismatch_booking_count += 1;
  }

  const delta_intersection_cents = sumCardIntersection - sumLedgerIntersection;
  const intersectionBroken =
    amount_mismatch_booking_count > 0 || sumCardIntersection !== sumLedgerIntersection;
  const strictMissing = strict && missing_ledger_row_count > 0;
  const invariant_failed = intersectionBroken || strictMissing;
  const ok = !invariant_failed;

  return {
    as_of,
    compared_bookings: cards.length,
    sum_card_cents: sumCard,
    sum_ledger_cents_for_compared_bookings: sumLedgerInSlice,
    amount_mismatch_booking_count,
    missing_ledger_row_count,
    intersection_booking_count,
    sum_card_intersection_cents: sumCardIntersection,
    sum_ledger_intersection_cents: sumLedgerIntersection,
    delta_intersection_cents,
    invariant_failed,
    ok,
  };
}
