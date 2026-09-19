import type { RecurringFrequency, ServiceSlug } from "@/src/features/booking-v2/types";

export const DEEP_CLEANING_RECURRING_FREQUENCY: RecurringFrequency = "monthly";

export function serviceAllowsRecurringBookings(serviceSlug: ServiceSlug): boolean {
  return serviceSlug !== "moving-cleaning";
}

export function recurringFrequenciesForService(
  serviceSlug: ServiceSlug,
): RecurringFrequency[] {
  if (!serviceAllowsRecurringBookings(serviceSlug)) return [];
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
  if (!serviceAllowsRecurringBookings(input.serviceSlug)) return false;
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
