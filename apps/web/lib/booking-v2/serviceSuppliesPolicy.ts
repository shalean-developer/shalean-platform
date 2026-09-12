import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

export type ServiceSuppliesPolicy =
  | "customer_or_shalean_logistics"
  | "shalean_included"
  | "unresolved";

/**
 * Customer-facing supplies/equipment responsibility for each canonical service.
 *
 * SR-04 policy:
 * - Regular + Airbnb: customer provides products/equipment, or Shalean can bring them for a logistics charge.
 * - Deep + Moving: Shalean supplies are included in the service.
 * - Office + Carpet: intentionally unresolved until their operating policy is explicitly approved.
 */
export function serviceSuppliesPolicy(slug: ServiceSlug): ServiceSuppliesPolicy {
  if (slug === "regular-cleaning" || slug === "airbnb-cleaning") {
    return "customer_or_shalean_logistics";
  }
  if (slug === "deep-cleaning" || slug === "moving-cleaning") {
    return "shalean_included";
  }
  return "unresolved";
}

export function serviceRequiresCustomerEquipmentChoice(slug: ServiceSlug): boolean {
  return serviceSuppliesPolicy(slug) === "customer_or_shalean_logistics";
}

export function serviceIncludesShaleanSupplies(slug: ServiceSlug): boolean {
  return serviceSuppliesPolicy(slug) === "shalean_included";
}
