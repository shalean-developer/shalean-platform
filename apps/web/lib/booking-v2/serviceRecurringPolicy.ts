import type { RecurringFrequency, ServiceSlug } from "@/src/features/booking-v2/types";

export const DEEP_CLEANING_RECURRING_FREQUENCY: RecurringFrequency = "monthly";

export function serviceAllowsRecurringBookings(serviceSlug: ServiceSlug): boolean {
  return (
    serviceSlug !== "moving-cleaning" &&
    serviceSlug !== "carpet-cleaning" &&
    serviceSlug !== "airbnb-cleaning"
  );
}

export function recurringFrequenciesForService(
  serviceSlug: ServiceSlug,
): RecurringFrequency[] {
  if (!serviceAllowsRecurringBookings(serviceSlug)) return [];
  if (serviceSlug === "deep-cleaning") {
    return [DEEP_CLEANING_RECURRING_FREQUENCY];
  }
  if (serviceSlug === "office-cleaning") {
    // Custom recurrence is not yet supported by the 30-day package engine.
    return ["weekly", "fortnightly", "monthly"];
  }
  return ["custom", "weekly", "fortnightly", "monthly"];
}

export function recurringScheduleAllowedForService(input: {
  serviceSlug: ServiceSlug;
  bookingType: "once_off" | "recurring";
  recurringFrequency: RecurringFrequency | "";
  recurringDays: readonly string[];
}): boolean {
  if (input.bookingType !== "recurring") return true;
  if (!serviceAllowsRecurringBookings(input.serviceSlug)) return false;
  const supported = recurringFrequenciesForService(input.serviceSlug);
  if (!supported.includes(input.recurringFrequency as RecurringFrequency)) {
    return false;
  }
  if (input.serviceSlug !== "deep-cleaning") return true;
  return (
    input.recurringFrequency === DEEP_CLEANING_RECURRING_FREQUENCY &&
    input.recurringDays.length === 0
  );
}

export function serviceUsesRecurringDayPicker(serviceSlug: ServiceSlug): boolean {
  return serviceAllowsRecurringBookings(serviceSlug) && serviceSlug !== "deep-cleaning";
}
