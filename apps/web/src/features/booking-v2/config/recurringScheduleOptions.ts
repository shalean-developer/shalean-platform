import type { RecurringFrequency } from "@/src/features/booking-v2/types";

export const RECURRING_FREQUENCY_OPTIONS: {
  value: RecurringFrequency;
  label: string;
}[] = [
  { value: "custom", label: "Custom days" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
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
  if (frequency === "custom") return "Custom days";
  if (frequency === "weekly") return "Weekly";
  if (frequency === "fortnightly") return "Fortnightly";
  if (frequency === "monthly") return "Monthly";
  return "";
}
