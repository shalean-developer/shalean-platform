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

/**
 * Cleaner cost for Office Booking Profitability.
 *
 * Team jobs must use the team-wide `cleaner_earnings_total_cents` and must never
 * silently fall back to one cleaner's `display_earnings_cents`.
 * Solo jobs continue to use `display_earnings_cents`.
 */
export type BookingProfitabilityCleanerCost = {
  /** Resolved cleaner cost in cents, or null when team totals are incomplete. */
  cleaner_cost_cents: number | null;
  incomplete_team_earnings: boolean;
  warning: string | null;
  included_in_trusted_totals: boolean;
};

export function resolveBookingProfitabilityCleanerCost(
  booking: BookingProfitabilityCleanerCostInput,
): BookingProfitabilityCleanerCost {
  if (booking.is_team_job === true) {
    const teamTotal = optionalCentsFromDb(booking.cleaner_earnings_total_cents);
    if (teamTotal === null) {
      return {
        cleaner_cost_cents: null,
        incomplete_team_earnings: true,
        warning: INCOMPLETE_TEAM_EARNINGS_WARNING,
        included_in_trusted_totals: false,
      };
    }
    return {
      cleaner_cost_cents: teamTotal,
      incomplete_team_earnings: false,
      warning: null,
      included_in_trusted_totals: true,
    };
  }

  const display = optionalCentsFromDb(booking.display_earnings_cents);
  return {
    cleaner_cost_cents: display ?? 0,
    incomplete_team_earnings: false,
    warning: null,
    included_in_trusted_totals: true,
  };
}

export type BookingProfitabilityRow = BookingProfitBreakdown & {
  cleaner_payment_cents: number | null;
  net_booking_profit_cents: number | null;
  profit_margin_percent: number | null;
  incomplete_team_earnings: boolean;
  warning: string | null;
  included_in_trusted_totals: boolean;
};

/**
 * Resolve cleaner cost, then compute booking profit / margin.
 * Incomplete team earnings return null net/margin and are excluded from trusted totals.
 */
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

  const profit = computeBookingProfit(
    customerPaymentCents,
    cost.cleaner_cost_cents,
    bookingExpensesCents,
    processingFeesCents,
    platformFeesCents,
    referralDiscountCents,
    cleaningCreditCents,
  );

  return {
    ...profit,
    incomplete_team_earnings: false,
    warning: null,
    included_in_trusted_totals: true,
  };
}

export type TrustedBookingProfitTotals = {
  booking_count: number;
  excluded_incomplete_team_count: number;
  customer_payment_cents: number;
  cleaner_payment_cents: number;
  net_booking_profit_cents: number;
};

/** Aggregate only rows that passed team-earnings completeness checks. */
export function sumTrustedBookingProfitTotals(
  rows: Array<Pick<
    BookingProfitabilityRow,
    | "included_in_trusted_totals"
    | "customer_payment_cents"
    | "cleaner_payment_cents"
    | "net_booking_profit_cents"
  >>,
): TrustedBookingProfitTotals {
  let booking_count = 0;
  let excluded_incomplete_team_count = 0;
  let customer_payment_cents = 0;
  let cleaner_payment_cents = 0;
  let net_booking_profit_cents = 0;

  for (const row of rows) {
    if (!row.included_in_trusted_totals) {
      excluded_incomplete_team_count += 1;
      continue;
    }
    booking_count += 1;
    customer_payment_cents += row.customer_payment_cents;
    cleaner_payment_cents += row.cleaner_payment_cents ?? 0;
    net_booking_profit_cents += row.net_booking_profit_cents ?? 0;
  }

  return {
    booking_count,
    excluded_incomplete_team_count,
    customer_payment_cents,
    cleaner_payment_cents,
    net_booking_profit_cents,
  };
}
