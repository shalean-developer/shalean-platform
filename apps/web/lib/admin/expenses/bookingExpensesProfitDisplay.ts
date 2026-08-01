import { INCOMPLETE_TEAM_EARNINGS_WARNING } from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";

/** Profit payload from GET `/api/admin/bookings/[id]/expenses`. */
export type BookingExpensesProfit = {
  customer_payment_cents: number;
  cleaner_payment_cents: number | null;
  booking_expenses_cents: number;
  processing_fees_cents: number;
  platform_fees_cents: number;
  referral_discount_cents?: number;
  cleaning_credit_cents?: number;
  net_booking_profit_cents: number | null;
  profit_margin_percent: number | null;
  incomplete_team_earnings?: boolean;
  warning?: string | null;
  included_in_trusted_totals?: boolean;
};

/**
 * Format cents as ZAR for booking profit cards.
 * Null must never coerce to R0 via `null / 100`.
 */
export function formatBookingProfitCentsZar(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return "—";
  return `R ${(Number(cents) / 100).toLocaleString("en-ZA")}`;
}

export function formatBookingProfitMarginPercent(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(Number(percent))) return "—";
  return `${percent}%`;
}

export function bookingProfitIncompleteTeamWarning(
  profit: Pick<BookingExpensesProfit, "incomplete_team_earnings" | "warning"> | null | undefined,
): string | null {
  if (!profit?.incomplete_team_earnings) return null;
  const warning = typeof profit.warning === "string" ? profit.warning.trim() : "";
  return warning || INCOMPLETE_TEAM_EARNINGS_WARNING;
}
