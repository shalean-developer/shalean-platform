import {
  johannesburgCalendarMonthDateRangeYmd,
  johannesburgCalendarYmd,
} from "./johannesburgMonth";

export const CLEANER_PAYOUT_CADENCE_LABEL = "Monthly";
export const CLEANER_PAYOUT_METHOD_LABEL = "Bank transfer";

export const CLEANER_PAYOUT_RECRUITMENT_COPY =
  "Monthly bank-transfer payouts for eligible completed jobs";

export const CLEANER_PAYOUT_BANK_READY_COPY =
  "You're set for monthly bank-transfer payouts.";

export const CLEANER_PAYOUT_HELP_COPY =
  "Earnings are grouped by Johannesburg calendar month (1st to last day). After the month closes, eligible settled earnings are reviewed and released by bank transfer. There is no guaranteed Monday or Friday payment date.";

export const CLEANER_PAYOUT_AVAILABLE_COPY =
  "Available earnings move into a closed-month payout once they are eligible and your bank details are on file.";

export const CLEANER_PAYOUT_PROCESSING_COPY =
  "Processing earnings are being reviewed or finalised for a monthly payout.";

function civilDayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

export type CleanerMonthlyPayoutCadence = {
  periodStartYmd: string;
  periodEndYmd: string;
  periodLabel: string;
  daysRemaining: number;
  headline: string;
  sub: string;
  cadenceLabel: typeof CLEANER_PAYOUT_CADENCE_LABEL;
  paymentMethodLabel: typeof CLEANER_PAYOUT_METHOD_LABEL;
};

/**
 * Cleaner-facing payout cadence source of truth.
 *
 * Earnings accrue by full Johannesburg calendar month. Once a month closes,
 * eligible settled earnings move through review/approval and are released by
 * bank transfer. No exact Monday/Friday payment date is promised.
 */
export function cleanerMonthlyPayoutCadenceJohannesburg(
  now = new Date(),
): CleanerMonthlyPayoutCadence {
  const todayYmd = johannesburgCalendarYmd(now);
  const { startYmd, endYmd } = johannesburgCalendarMonthDateRangeYmd(now);
  const daysRemaining = Math.max(0, civilDayNumber(endYmd) - civilDayNumber(todayYmd));
  const periodLabel = new Date(`${startYmd}T12:00:00+02:00`).toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    month: "long",
    year: "numeric",
  });

  const headline =
    daysRemaining === 0
      ? `Monthly payout period ends today (${periodLabel})`
      : `Monthly payout period — ${periodLabel} (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left)`;

  return {
    periodStartYmd: startYmd,
    periodEndYmd: endYmd,
    periodLabel,
    daysRemaining,
    headline,
    sub: CLEANER_PAYOUT_HELP_COPY,
    cadenceLabel: CLEANER_PAYOUT_CADENCE_LABEL,
    paymentMethodLabel: CLEANER_PAYOUT_METHOD_LABEL,
  };
}
