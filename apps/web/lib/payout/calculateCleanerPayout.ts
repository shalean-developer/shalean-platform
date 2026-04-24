import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";

const FIXED_SERVICE_IDS = new Set<BookingServiceId>(["deep", "move", "carpet"]);
/** R250 in cents */
export const MIN_PAYOUT_CENTS = 25_000;
/** R350 in cents: base payout cap; excess cleaner share is stored as bonus. */
export const MAX_BASE_PAYOUT_CENTS = 35_000;

const NEW_CLEANER_RATE = 0.6;
const EXPERIENCED_CLEANER_RATE = 0.7;
const EXPERIENCE_MONTHS_THRESHOLD = 4;

export type CleanerPayoutResult = {
  payoutCents: number;
  bonusCents: number;
  companyRevenueCents: number;
  payoutType: "percentage";
  /** Decimal rate applied for percentage model, e.g. 0.7 */
  payoutPercentage: number;
  /** Subtotal cleaner payout was computed from (excludes platform service fee). */
  payoutBaseCents: number;
  /** Platform fee added to company revenue only. */
  serviceFeeCents: number;
};

function monthsBetween(fromMs: number, toMs: number): number {
  const msPerMonth = 1000 * 60 * 60 * 24 * 30;
  return (toMs - fromMs) / msPerMonth;
}

function resolveServiceIdFromSnapshot(snapshot: unknown): BookingServiceId | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const locked = (snapshot as { locked?: unknown }).locked;
  if (!locked || typeof locked !== "object" || Array.isArray(locked)) return null;
  return parseBookingServiceId((locked as { service?: unknown }).service);
}

/**
 * Detect fixed-payout specials using catalog id first, then label heuristics.
 */
export function isFixedPayoutSpecial(serviceId: BookingServiceId | null, serviceLabel: string | null): boolean {
  if (serviceId && FIXED_SERVICE_IDS.has(serviceId)) return true;
  const s = (serviceLabel ?? "").toLowerCase();
  if (!s) return false;
  if (/\bdeep\b/i.test(s) || s.includes("deep clean")) return true;
  if (/\bmove\b/i.test(s) || s.includes("move in") || s.includes("move out")) return true;
  if (/\bcarpet\b/i.test(s)) return true;
  return false;
}

/**
 * Total paid for the job in **cents** (ZAR).
 */
export function resolveTotalPaidCents(totalPaidZar: number | null | undefined, amountPaidCents: number | null | undefined): number {
  const zar = Number(totalPaidZar);
  if (Number.isFinite(zar) && zar > 0) {
    return Math.max(0, Math.round(zar * 100));
  }
  const cents = Number(amountPaidCents);
  if (Number.isFinite(cents) && cents > 0) {
    return Math.max(0, Math.round(cents));
  }
  return 0;
}

/** Central hybrid payout rules: percentage + minimum + base cap + bonus. */
export function calculateCleanerPayout(params: {
  totalPaidCents: number;
  serviceId: BookingServiceId | null;
  serviceLabel: string | null;
  /** Cleaner tenure anchor (e.g. `cleaners.created_at`). Missing → treated as new cleaner. */
  cleanerTenureStartMs: number | null;
  nowMs?: number;
}): CleanerPayoutResult {
  const total = Math.max(0, Math.floor(params.totalPaidCents));
  const now = params.nowMs ?? Date.now();

  if (total === 0) {
    return {
      payoutCents: 0,
      bonusCents: 0,
      companyRevenueCents: 0,
      payoutType: "percentage",
      payoutPercentage: NEW_CLEANER_RATE,
      payoutBaseCents: 0,
      serviceFeeCents: 0,
    };
  }

  const tenureStart = params.cleanerTenureStartMs;
  const monthsWorked = tenureStart != null && Number.isFinite(tenureStart) ? monthsBetween(tenureStart, now) : 0;
  const isExperienced = monthsWorked >= EXPERIENCE_MONTHS_THRESHOLD;
  const percentage = isExperienced ? EXPERIENCED_CLEANER_RATE : NEW_CLEANER_RATE;
  const percentagePayout = Math.round(total * percentage);
  const baseBeforeTotalCap = Math.min(Math.max(percentagePayout, MIN_PAYOUT_CENTS), MAX_BASE_PAYOUT_CENTS);
  const payoutCents = Math.min(baseBeforeTotalCap, total);
  const rawBonusCents = Math.max(0, percentagePayout - MAX_BASE_PAYOUT_CENTS);
  const bonusCents = Math.min(rawBonusCents, Math.max(0, total - payoutCents));
  const companyRevenue = Math.max(0, total - payoutCents - bonusCents);

  return {
    payoutCents,
    bonusCents,
    companyRevenueCents: companyRevenue,
    payoutType: "percentage",
    payoutPercentage: percentage,
    payoutBaseCents: total,
    serviceFeeCents: 0,
  };
}

/**
 * Resolve payout base (cleaner share pool) and platform fee from stored booking columns.
 * Legacy rows: `base_amount_cents` null → entire amount paid is the payout base; fee treated as 0 for split.
 */
export function resolvePayoutBaseAndServiceFeeCents(params: {
  baseAmountCents: number | null | undefined;
  serviceFeeCents: number | null | undefined;
  totalPaidZar: number | null | undefined;
  amountPaidCents: number | null | undefined;
}): { payoutBaseCents: number; serviceFeeCents: number } {
  const totalCents = resolveTotalPaidCents(params.totalPaidZar, params.amountPaidCents);
  const baseStored =
    params.baseAmountCents != null && Number.isFinite(Number(params.baseAmountCents))
      ? Math.max(0, Math.floor(Number(params.baseAmountCents)))
      : null;
  const feeStored =
    params.serviceFeeCents != null && Number.isFinite(Number(params.serviceFeeCents))
      ? Math.max(0, Math.floor(Number(params.serviceFeeCents)))
      : 0;

  if (baseStored == null || baseStored <= 0) {
    return { payoutBaseCents: totalCents, serviceFeeCents: 0 };
  }

  if (baseStored + feeStored > totalCents + 5) {
    return { payoutBaseCents: totalCents, serviceFeeCents: 0 };
  }

  return { payoutBaseCents: baseStored, serviceFeeCents: feeStored };
}

/**
 * Convenience: parse snapshot `locked.service` + label for rules.
 * Company revenue includes platform service fee: (payoutBase − cleanerPayout) + serviceFee.
 */
export function calculateCleanerPayoutFromBookingRow(params: {
  totalPaidZar: number | null | undefined;
  amountPaidCents: number | null | undefined;
  baseAmountCents?: number | null | undefined;
  serviceFeeCents?: number | null | undefined;
  serviceLabel: string | null | undefined;
  bookingSnapshot: unknown;
  cleanerCreatedAtIso: string | null | undefined;
  nowMs?: number;
}): CleanerPayoutResult {
  const { payoutBaseCents, serviceFeeCents } = resolvePayoutBaseAndServiceFeeCents({
    baseAmountCents: params.baseAmountCents,
    serviceFeeCents: params.serviceFeeCents,
    totalPaidZar: params.totalPaidZar,
    amountPaidCents: params.amountPaidCents,
  });

  const sid = resolveServiceIdFromSnapshot(params.bookingSnapshot);
  const label = typeof params.serviceLabel === "string" ? params.serviceLabel : null;
  const tenureMs =
    typeof params.cleanerCreatedAtIso === "string" && params.cleanerCreatedAtIso
      ? new Date(params.cleanerCreatedAtIso).getTime()
      : null;
  const inner = calculateCleanerPayout({
    totalPaidCents: payoutBaseCents,
    serviceId: sid,
    serviceLabel: label,
    cleanerTenureStartMs: tenureMs != null && Number.isFinite(tenureMs) ? tenureMs : null,
    nowMs: params.nowMs,
  });

  return {
    ...inner,
    companyRevenueCents: Math.max(0, inner.companyRevenueCents + serviceFeeCents),
    payoutBaseCents,
    serviceFeeCents,
  };
}
