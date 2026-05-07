/**
 * Mode-aware financial cap for `bookings_cleaner_payout_lte_financial_cap` (mirrors migration
 * `20260639_bookings_billing_type_mode_aware_payout_cap.sql`).
 *
 * Prepaid: cap = collected cash semantics — `total_paid_cents` then `amount_paid_cents` (including 0)
 * then ZAR line.
 *
 * Accrual (invoice / recurring): cap = service/invoice line value — `total_paid_cents` then ZAR minor,
 * then `nullif(amount_paid_cents, 0)` so an explicit pre-settlement `0` does not hide quoted value.
 */

export const BOOKING_BILLING_TYPES = ["prepaid", "recurring_invoice", "monthly_contract", "pay_later"] as const;
export type BookingBillingType = (typeof BOOKING_BILLING_TYPES)[number];

export type BookingRowForPayoutCap = {
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  payment_status?: string | null;
  monthly_invoice_id?: string | null;
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  total_paid_zar?: number | null;
};

function normLower(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/** True when DB CHECK uses the accrual (invoice / service value) RHS. */
export function bookingUsesAccrualPayoutCap(row: BookingRowForPayoutCap): boolean {
  const bt = normLower(row.billing_type);
  if (bt === "recurring_invoice" || bt === "monthly_contract" || bt === "pay_later") return true;
  if (row.is_monthly_billing_booking === true) return true;
  if (normLower(row.payment_status) === "pending_monthly") return true;
  const mid = row.monthly_invoice_id;
  if (mid != null && String(mid).trim() !== "") return true;
  return false;
}

function finiteNonNegInt(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const f = Math.floor(x);
  return f >= 0 ? f : null;
}

/** `amount_paid_cents` only when >0 (matches SQL `nullif(amount_paid_cents, 0)` for accrual cap). */
function amountPaidNonZeroCents(n: unknown): number | null {
  const v = finiteNonNegInt(n);
  if (v == null || v === 0) return null;
  return v;
}

function zarToMinorCents(zar: unknown): number | null {
  if (zar === null || zar === undefined) return null;
  const z = Number(zar);
  if (!Number.isFinite(z) || z <= 0) return null;
  return Math.max(0, Math.round(z * 100));
}

/**
 * Maximum allowed `cleaner_payout_cents + cleaner_bonus_cents` for the row (hybrid model).
 * Matches Postgres CHECK for operational pre-validation.
 */
export function bookingPayoutConstraintCapCents(row: BookingRowForPayoutCap): number {
  const accrual = bookingUsesAccrualPayoutCap(row);
  const tpc = finiteNonNegInt(row.total_paid_cents);
  const zarMinor = zarToMinorCents(row.total_paid_zar);

  if (accrual) {
    const apNonZero = amountPaidNonZeroCents(row.amount_paid_cents);
    return tpc ?? zarMinor ?? apNonZero ?? 0;
  }

  const ap = finiteNonNegInt(row.amount_paid_cents);
  return tpc ?? ap ?? zarMinor ?? 0;
}

export type BookingFinancialDiagnostics = {
  billing_type: string | null;
  payment_status: string | null;
  constraint_mode: "prepaid" | "accrual";
  /** Best-effort: booked customer cash on the row (`total_paid_cents` ?? `amount_paid_cents`). */
  customer_collected_cents: number | null;
  /** Quoted line in minor units from `total_paid_zar` when present. */
  service_value_cents: number | null;
  /** RHS of hybrid payout cap (same as {@link bookingPayoutConstraintCapCents}). */
  payout_accrual_basis_cents: number;
  /** When `amount_paid_cents > 0`, mirrors partial/settled cash applied on the booking row. */
  payout_settlement_basis_cents: number | null;
};

/** Structured fields for logs / ops (no extra DB columns required). */
export function bookingFinancialDiagnostics(row: BookingRowForPayoutCap): BookingFinancialDiagnostics {
  const accrual = bookingUsesAccrualPayoutCap(row);
  const tpc = finiteNonNegInt(row.total_paid_cents);
  const apAll = finiteNonNegInt(row.amount_paid_cents);
  const zarMinor = zarToMinorCents(row.total_paid_zar);
  const collected = tpc ?? apAll ?? null;
  const settlement = amountPaidNonZeroCents(row.amount_paid_cents);
  return {
    billing_type: row.billing_type != null ? String(row.billing_type) : null,
    payment_status: row.payment_status != null ? String(row.payment_status) : null,
    constraint_mode: accrual ? "accrual" : "prepaid",
    customer_collected_cents: collected,
    service_value_cents: zarMinor,
    payout_accrual_basis_cents: bookingPayoutConstraintCapCents(row),
    payout_settlement_basis_cents: settlement,
  };
}

export function assertHybridPayoutWithinFinancialCap(params: {
  row: BookingRowForPayoutCap;
  payoutCents: number;
  bonusCents: number;
}): { ok: true } | { ok: false; code: "payout_exceeds_financial_cap"; cap: number; hybrid: number } {
  const cap = bookingPayoutConstraintCapCents(params.row);
  const hybrid = Math.max(0, Math.floor(Number(params.payoutCents) || 0)) + Math.max(0, Math.floor(Number(params.bonusCents) || 0));
  if (hybrid <= cap) return { ok: true };
  return { ok: false, code: "payout_exceeds_financial_cap", cap, hybrid };
}
