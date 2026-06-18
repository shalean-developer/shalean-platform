import type { RecurringFrequency } from "@/src/features/booking-v2/types";

export const RECURRING_FREQUENCY_OPTIONS: {
  value: Exclude<RecurringFrequency, "custom">;
  label: string;
}[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

export const RECURRING_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Preferred-day picker applies to standard cadences (not a separate "custom" plan). */
export function shouldShowRecurringDayPicker(
  frequency: RecurringFrequency | "" | undefined,
): boolean {
  return (
    frequency === "weekly" ||
    frequency === "fortnightly" ||
    frequency === "monthly" ||
    frequency === "custom"
  );
}

export function recurringFrequencyLabel(frequency: RecurringFrequency | "" | undefined): string {
  if (frequency === "weekly" || frequency === "custom") return "Weekly";
  if (frequency === "fortnightly") return "Every 2 weeks";
  if (frequency === "monthly") return "Monthly";
  return "";
}
