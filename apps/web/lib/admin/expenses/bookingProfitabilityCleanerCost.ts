import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import {
  computeBookingProfit,
  type BookingProfitBreakdown,
} from "@/lib/admin/expenses/profitCalculations";

export const INCOMPLETE_TEAM_EARNINGS_WARNING = "Incomplete team earnings";

export type BookingProfitabilityCleanerCostInput = {
  is_team_job?: boolean | null;
  cleaner_earnings_total_cents?: unknown;
  display_earnings_cents?: unknown;
};

export type BookingProfitabilityCleanerCost = {
  cleaner_cost_cents: number | null;
  incomplete_team_earnings: boolean;
  warning: string | null;
  included_in_trusted_totals: boolean;
};

export function isCompleteTeamEarningsTotalCents(value: unknown): value is number {
  const teamTotal = optionalCentsFromDb(value);
  return teamTotal !== null && teamTotal > 0;
}

/**
 * Canonical booking-level cleaner cost for profitability.
 *
 * - Explicit team jobs require a positive booking-wide cleaner total. Missing totals are
 *   incomplete and must never fall back to a single cleaner's display amount.
 * - Non-team bookings may still have a multi-cleaner roster (paired Standard jobs). When
 *   the stored booking-wide total is greater than the per-cleaner display lock, the total
 *   is authoritative. This keeps profitability aligned with the payout report without
 *   changing the booking's operational `is_team_job` classification.
 * - Normal solo jobs continue to use the display lock.
 */
export function resolveBookingProfitabilityCleanerCost(
  booking: BookingProfitabilityCleanerCostInput,
): BookingProfitabilityCleanerCost {
  const total = optionalCentsFromDb(booking.cleaner_earnings_total_cents);
  const display = optionalCentsFromDb(booking.display_earnings_cents);

  if (booking.is_team_job === true) {
    if (total === null || total <= 0) {
      return {
        cleaner_cost_cents: null,
        incomplete_team_earnings: true,
        warning: INCOMPLETE_TEAM_EARNINGS_WARNING,
        included_in_trusted_totals: false,
      };
    }
    return {
      cleaner_cost_cents: total,
      incomplete_team_earnings: false,
      warning: null,
      included_in_trusted_totals: true,
    };
  }

  const cleanerCost = total !== null && total > (display ?? 0) ? total : (display ?? total ?? 0);
  return {
    cleaner_cost_cents: cleanerCost,
    incomplete_team_earnings: false,
    warning: null,
    included_in_trusted_totals: true,
  };
}

export type TrustedBookingRollupContribution =
  | { included_in_trusted_totals: true; customer_revenue_cents: number; cleaner_cost_cents: number }
  | { included_in_trusted_totals: false; incomplete_team_earnings: true; customer_revenue_cents: number; cleaner_cost_cents: null };

export function trustedBookingRollupContribution(
  booking: BookingProfitabilityCleanerCostInput,
  customerRevenueCents: number,
): TrustedBookingRollupContribution {
  const cost = resolveBookingProfitabilityCleanerCost(booking);
  const revenue = Math.max(0, Math.round(customerRevenueCents));
  if (!cost.included_in_trusted_totals || cost.cleaner_cost_cents == null) {
    return {
      included_in_trusted_totals: false,
      incomplete_team_earnings: true,
      customer_revenue_cents: revenue,
      cleaner_cost_cents: null,
    };
  }
  return { included_in_trusted_totals: true, customer_revenue_cents: revenue, cleaner_cost_cents: cost.cleaner_cost_cents };
}

export type BookingProfitabilityRow = Omit<BookingProfitBreakdown,"cleaner_payment_cents"|"net_booking_profit_cents"|"profit_margin_percent"> & {
  cleaner_payment_cents: number | null;
  net_booking_profit_cents: number | null;
  profit_margin_percent: number | null;
  incomplete_team_earnings: boolean;
  warning: string | null;
  included_in_trusted_totals: boolean;
};

export function computeBookingProfitabilityRow(
  booking: BookingProfitabilityCleanerCostInput,
  customerPaymentCents: number,
  bookingExpensesCents: number,
  processingFeesCents = 0,
  platformFeesCents = 0,
  referralDiscountCents = 0,
  cleaningCreditCents = 0,
): BookingProfitabilityRow {
  const cost = resolveBookingProfitabilityCleanerCost(booking);
  if (cost.incomplete_team_earnings || cost.cleaner_cost_cents === null) {
    const customer = Math.max(0, Math.round(customerPaymentCents));
    const expenses = Math.max(0, Math.round(bookingExpensesCents));
    const processing = Math.max(0, Math.round(processingFeesCents));
    const platform = Math.max(0, Math.round(platformFeesCents));
    const referralDiscount = Math.max(0, Math.round(referralDiscountCents));
    const cleaningCredit = Math.max(0, Math.round(cleaningCreditCents));
    return {
      customer_payment_cents: customer,
      cleaner_payment_cents: null,
      booking_expenses_cents: expenses,
      processing_fees_cents: processing,
      platform_fees_cents: platform,
      referral_discount_cents: referralDiscount,
      cleaning_credit_cents: cleaningCredit,
      net_booking_profit_cents: null,
      profit_margin_percent: null,
      incomplete_team_earnings: true,
      warning: cost.warning ?? INCOMPLETE_TEAM_EARNINGS_WARNING,
      included_in_trusted_totals: false,
    };
  }
  const profit = computeBookingProfit(customerPaymentCents,cost.cleaner_cost_cents,bookingExpensesCents,processingFeesCents,platformFeesCents,referralDiscountCents,cleaningCreditCents);
  return { ...profit, incomplete_team_earnings: false, warning: null, included_in_trusted_totals: true };
}

export type TrustedBookingProfitTotals = {
  booking_count: number;
  excluded_incomplete_team_count: number;
  customer_payment_cents: number;
  cleaner_payment_cents: number;
  net_booking_profit_cents: number;
};

export function sumTrustedBookingProfitTotals(
  rows: Array<Pick<BookingProfitabilityRow,"included_in_trusted_totals"|"customer_payment_cents"|"cleaner_payment_cents"|"net_booking_profit_cents">>,
): TrustedBookingProfitTotals {
  let booking_count=0, excluded_incomplete_team_count=0, customer_payment_cents=0, cleaner_payment_cents=0, net_booking_profit_cents=0;
  for (const row of rows) {
    if (!row.included_in_trusted_totals) { excluded_incomplete_team_count += 1; continue; }
    booking_count += 1;
    customer_payment_cents += row.customer_payment_cents;
    cleaner_payment_cents += row.cleaner_payment_cents ?? 0;
    net_booking_profit_cents += row.net_booking_profit_cents ?? 0;
  }
  return { booking_count, excluded_incomplete_team_count, customer_payment_cents, cleaner_payment_cents, net_booking_profit_cents };
}

export function paginateBookingProfitabilityItems<T>(periodRows:T[],page:number,pageSize:number):{items:T[];page:number;page_size:number;total:number}{
  const safePage=Math.max(1,Math.floor(page)||1); const safeSize=Math.min(100,Math.max(1,Math.floor(pageSize)||50)); const start=(safePage-1)*safeSize;
  return {items:periodRows.slice(start,start+safeSize),page:safePage,page_size:safeSize,total:periodRows.length};
}
