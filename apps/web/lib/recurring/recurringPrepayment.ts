import { occurrenceDatesInclusive, type RecurringScheduleRow } from "@/lib/recurring/calculateNextRunDate";
import { addDaysYmd, isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";

const DAY_NAME_TO_ISO: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

export const RECURRING_PREPAYMENT_WINDOW_DAYS = 30;

function frequencyForSchedule(raw: string): RecurringScheduleRow["frequency"] | null {
  const value = raw.trim().toLowerCase();
  if (value === "weekly") return "weekly";
  if (value === "fortnightly" || value === "biweekly") return "biweekly";
  if (value === "monthly") return "monthly";
  return null;
}

function recurringIsoDays(days: readonly string[], startDate: string): number[] {
  const parsed = days
    .map((day) => DAY_NAME_TO_ISO[day.trim().toLowerCase()] ?? null)
    .filter((day): day is number => day != null);
  return [...new Set(parsed.length > 0 ? parsed : [isoWeekdayFromYmd(startDate)])];
}

export type RecurringPrepaymentQuote = {
  coverageStartDate: string;
  coverageEndDate: string;
  occurrenceDates: string[];
  visitCount: number;
  perVisitZar: number;
  grossPackageZar: number;
};

/** Exact service dates in the first 30 calendar days, inclusive of the selected start date. */
export function buildRecurringPrepaymentQuote(input: {
  startDate: string;
  frequency: string;
  recurringDays: readonly string[];
  perVisitZar: number;
}): RecurringPrepaymentQuote | null {
  const frequency = frequencyForSchedule(input.frequency);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !frequency) return null;

  const coverageEndDate = addDaysYmd(input.startDate, RECURRING_PREPAYMENT_WINDOW_DAYS - 1);
  const schedule: RecurringScheduleRow = {
    frequency,
    days_of_week: recurringIsoDays(input.recurringDays, input.startDate),
    start_date: input.startDate,
    end_date: coverageEndDate,
    monthly_pattern: "mirror_start_date",
    monthly_nth: null,
  };
  const occurrenceDates = occurrenceDatesInclusive(schedule, input.startDate, coverageEndDate);
  if (!occurrenceDates.includes(input.startDate)) occurrenceDates.unshift(input.startDate);
  const uniqueDates = [...new Set(occurrenceDates)].sort();
  const perVisitZar = Math.max(0, Math.round(input.perVisitZar));

  return {
    coverageStartDate: input.startDate,
    coverageEndDate,
    occurrenceDates: uniqueDates,
    visitCount: uniqueDates.length,
    perVisitZar,
    grossPackageZar: perVisitZar * uniqueDates.length,
  };
}

/** Allocate checkout-level discounts once while preserving the plan's per-visit catalogue price. */
export function allocateRecurringPrepayment(input: {
  occurrenceDates: readonly string[];
  perVisitZar: number;
  packagePayableZar: number;
}): Array<{ occurrenceDate: string; allocatedZar: number }> {
  const dates = [...new Set(input.occurrenceDates)].sort();
  if (dates.length === 0) return [];
  const perVisit = Math.max(0, Math.round(input.perVisitZar));
  let remaining = Math.max(0, Math.round(input.packagePayableZar));
  return dates.map((occurrenceDate, index) => {
    const allocatedZar = index === dates.length - 1
      ? remaining
      : Math.min(perVisit, remaining);
    remaining = Math.max(0, remaining - allocatedZar);
    return { occurrenceDate, allocatedZar };
  });
}
