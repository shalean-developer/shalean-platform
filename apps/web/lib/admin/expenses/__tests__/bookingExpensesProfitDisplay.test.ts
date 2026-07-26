import { describe, expect, it } from "vitest";
import { INCOMPLETE_TEAM_EARNINGS_WARNING } from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";
import {
  bookingProfitIncompleteTeamWarning,
  formatBookingProfitCentsZar,
  formatBookingProfitMarginPercent,
  type BookingExpensesProfit,
} from "@/lib/admin/expenses/bookingExpensesProfitDisplay";

describe("bookingExpensesProfitDisplay", () => {
  it("never converts null cleaner/net/margin to R0 via null/100", () => {
    const incomplete: BookingExpensesProfit = {
      customer_payment_cents: 250_000,
      cleaner_payment_cents: null,
      booking_expenses_cents: 5_000,
      processing_fees_cents: 0,
      platform_fees_cents: 0,
      net_booking_profit_cents: null,
      profit_margin_percent: null,
      incomplete_team_earnings: true,
      warning: INCOMPLETE_TEAM_EARNINGS_WARNING,
      included_in_trusted_totals: false,
    };

    // Regression: runtime JS coerces `null / 100` → 0 → "R 0" if callers divide unchecked.
    const coerced = (null as unknown as number) / 100;
    expect(coerced).toBe(0);
    expect(formatBookingProfitCentsZar(incomplete.cleaner_payment_cents)).toBe("—");
    expect(formatBookingProfitCentsZar(incomplete.net_booking_profit_cents)).toBe("—");
    expect(formatBookingProfitMarginPercent(incomplete.profit_margin_percent)).toBe("—");
    expect(formatBookingProfitCentsZar(incomplete.cleaner_payment_cents)).not.toBe("R 0");
    expect(formatBookingProfitCentsZar(incomplete.net_booking_profit_cents)).not.toBe("R 0");
    expect(bookingProfitIncompleteTeamWarning(incomplete)).toBe(INCOMPLETE_TEAM_EARNINGS_WARNING);
  });

  it("formats finite cents and margin normally", () => {
    const zar = formatBookingProfitCentsZar(127_000);
    expect(zar.startsWith("R ")).toBe(true);
    expect(zar.replace(/\s/g, "")).toContain("1270");
    expect(formatBookingProfitMarginPercent(49.2)).toBe("49.2%");
    expect(
      bookingProfitIncompleteTeamWarning({
        incomplete_team_earnings: false,
        warning: null,
      }),
    ).toBeNull();
  });
});
