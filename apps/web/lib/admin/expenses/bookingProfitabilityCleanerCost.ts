import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import { resolveBookingWideCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
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
 * Finance/profitability adapter for the canonical booking-wide cleaner earnings policy.
 * The policy itself lives with cleaner/payout earnings resolution so finance does not
 * independently reinterpret booking earnings fields.
 */
export function resolveBookingProfitabilityCleanerCost(
  booking: BookingProfitabilityCleanerCostInput,
): BookingProfitabilityCleanerCost {
  const resolved = resolveBookingWideCleanerEarningsCents(booking);
  return {
    ...resolved,
    warning: resolved.incomplete_team_earnings ? INCOMPLETE_TEAM_EARNINGS_WARNING : null,
  };
}

export type TrustedBookingRollupContribution =
  | { included_in_trusted_totals: true; customer_revenue_cents: number; cleaner_cost_cents: number }
  | { included_in_trusted_totals: false; incomplete_team_earnings: true; customer_revenue_cents: number; cleaner_cost_cents: null };

export function trustedBookingRollupContribution(booking: BookingProfitabilityCleanerCostInput, customerRevenueCents: number): TrustedBookingRollupContribution {
  const cost = resolveBookingProfitabilityCleanerCost(booking);
  const revenue = Math.max(0, Math.round(customerRevenueCents));
  if (!cost.included_in_trusted_totals || cost.cleaner_cost_cents == null) return { included_in_trusted_totals: false, incomplete_team_earnings: true, customer_revenue_cents: revenue, cleaner_cost_cents: null };
  return { included_in_trusted_totals: true, customer_revenue_cents: revenue, cleaner_cost_cents: cost.cleaner_cost_cents };
}

export type BookingProfitabilityRow = Omit<BookingProfitBreakdown,"cleaner_payment_cents"|"net_booking_profit_cents"|"profit_margin_percent"> & { cleaner_payment_cents:number|null; net_booking_profit_cents:number|null; profit_margin_percent:number|null; incomplete_team_earnings:boolean; warning:string|null; included_in_trusted_totals:boolean };

export function computeBookingProfitabilityRow(booking:BookingProfitabilityCleanerCostInput,customerPaymentCents:number,bookingExpensesCents:number,processingFeesCents=0,platformFeesCents=0,referralDiscountCents=0,cleaningCreditCents=0):BookingProfitabilityRow {
  const cost=resolveBookingProfitabilityCleanerCost(booking);
  if(cost.incomplete_team_earnings||cost.cleaner_cost_cents===null){
    const customer=Math.max(0,Math.round(customerPaymentCents)); const expenses=Math.max(0,Math.round(bookingExpensesCents)); const processing=Math.max(0,Math.round(processingFeesCents)); const platform=Math.max(0,Math.round(platformFeesCents)); const referralDiscount=Math.max(0,Math.round(referralDiscountCents)); const cleaningCredit=Math.max(0,Math.round(cleaningCreditCents));
    return {customer_payment_cents:customer,cleaner_payment_cents:null,booking_expenses_cents:expenses,processing_fees_cents:processing,platform_fees_cents:platform,referral_discount_cents:referralDiscount,cleaning_credit_cents:cleaningCredit,net_booking_profit_cents:null,profit_margin_percent:null,incomplete_team_earnings:true,warning:cost.warning??INCOMPLETE_TEAM_EARNINGS_WARNING,included_in_trusted_totals:false};
  }
  const profit=computeBookingProfit(customerPaymentCents,cost.cleaner_cost_cents,bookingExpensesCents,processingFeesCents,platformFeesCents,referralDiscountCents,cleaningCreditCents);
  return {...profit,incomplete_team_earnings:false,warning:null,included_in_trusted_totals:true};
}

export type TrustedBookingProfitTotals={booking_count:number;excluded_incomplete_team_count:number;customer_payment_cents:number;cleaner_payment_cents:number;net_booking_profit_cents:number};
export function sumTrustedBookingProfitTotals(rows:Array<Pick<BookingProfitabilityRow,"included_in_trusted_totals"|"customer_payment_cents"|"cleaner_payment_cents"|"net_booking_profit_cents">>):TrustedBookingProfitTotals {let booking_count=0,excluded_incomplete_team_count=0,customer_payment_cents=0,cleaner_payment_cents=0,net_booking_profit_cents=0;for(const row of rows){if(!row.included_in_trusted_totals){excluded_incomplete_team_count++;continue;}booking_count++;customer_payment_cents+=row.customer_payment_cents;cleaner_payment_cents+=row.cleaner_payment_cents??0;net_booking_profit_cents+=row.net_booking_profit_cents??0;}return{booking_count,excluded_incomplete_team_count,customer_payment_cents,cleaner_payment_cents,net_booking_profit_cents};}
export function paginateBookingProfitabilityItems<T>(periodRows:T[],page:number,pageSize:number):{items:T[];page:number;page_size:number;total:number}{const safePage=Math.max(1,Math.floor(page)||1);const safeSize=Math.min(100,Math.max(1,Math.floor(pageSize)||50));const start=(safePage-1)*safeSize;return{items:periodRows.slice(start,start+safeSize),page:safePage,page_size:safeSize,total:periodRows.length};}
