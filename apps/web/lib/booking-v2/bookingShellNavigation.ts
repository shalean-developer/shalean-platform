import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

const PROGRESSIVE_DETAILS_SERVICES: ReadonlySet<ServiceSlug> = new Set([
  "regular-cleaning",
  "deep-cleaning",
  "moving-cleaning",
  "office-cleaning",
  "carpet-cleaning",
  "airbnb-cleaning",
]);

export function shouldShowBookingShellNavigation(
  currentStep: number,
  serviceSlug: ServiceSlug,
): boolean {
  return currentStep > 2 || !PROGRESSIVE_DETAILS_SERVICES.has(serviceSlug);
}
