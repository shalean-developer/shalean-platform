import type { RecurringFrequency, ServiceSlug } from "@/src/features/booking-v2/types";

export const DEEP_CLEANING_RECURRING_FREQUENCY: RecurringFrequency = "monthly";\n\nexport function serviceAllowsRecurringBookings(serviceSlug: ServiceSlug): boolean {\n  return serviceSlug !== "moving-cleaning";\n}

export function recurringFrequenciesForService(
  serviceSlug: ServiceSlug,
): RecurringFrequency[] {
  return serviceSlug === "deep-cleaning"
    ? [DEEP_CLEANING_RECURRING_FREQUENCY]
    : ["custom", "weekly", "fortnightly", "monthly"];
}

export function recurringScheduleAllowedForService(input: {
  serviceSlug: ServiceSlug;
  bookingType: "once_off" | "recurring";
  recurringFrequency: RecurringFrequency | "";
  recurringDays: readonly string[];
}): boolean {
  if (input.bookingType !== "recurring") return true;
  if (input.serviceSlug !== "deep-cleaning") {
    return Boolean(input.recurringFrequency);
  }
  return (
    input.recurringFrequency === DEEP_CLEANING_RECURRING_FREQUENCY &&
    input.recurringDays.length === 0
  );
}

export function serviceUsesRecurringDayPicker(serviceSlug: ServiceSlug): boolean {
  return serviceAllowsRecurringBookings(serviceSlug) && serviceSlug !== "deep-cleaning";
}
