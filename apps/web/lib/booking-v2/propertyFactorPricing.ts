import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { serviceShowsCleaningProductsQuestion } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2FeesConfig } from "@/lib/booking-v2/types";
import {
  computePropertyFactors as computePropertyFactorsShared,
  EXTRA_CLEANER_SERVICE_SLUGS as EXTRA_CLEANER_SERVICE_SLUGS_SHARED,
  type PropertyFactorResult,
} from "@shalean/pricing";

export type { PropertyFactorResult };

/** Services that charge extra cleaner cost (individual mode only). */
export const EXTRA_CLEANER_SERVICE_SLUGS = EXTRA_CLEANER_SERVICE_SLUGS_SHARED as Set<ServiceSlug>;

export function computePropertyFactors(
  serviceSlug: ServiceSlug,
  serviceDetails: Record<string, string | number | boolean>,
  catalog: {
    pricePerBedroom: number;
    pricePerBathroom: number;
    pricePerExtraRoom: number;
  },
  feesConfig: BookingV2FeesConfig,
): PropertyFactorResult {
  return computePropertyFactorsShared(
    serviceSlug,
    serviceDetails,
    catalog,
    feesConfig.propertyFactorRates,
  );
}

export function computeSuppliesEquipmentFee(
  serviceDetails: Record<string, string | number | boolean>,
  feesConfig: BookingV2FeesConfig,
  options?: { serviceSlug?: ServiceSlug; showCleaningProductsQuestion?: boolean },
): number {
  const showQuestion =
    options?.showCleaningProductsQuestion ??
    (options?.serviceSlug ? serviceShowsCleaningProductsQuestion(options.serviceSlug) : true);
  if (!showQuestion) return 0;
  const products = String(serviceDetails.cleaningProducts ?? "").trim().toLowerCase();
  if (products === "yes") return 0;
  if (products === "no") return feesConfig.suppliesEquipmentFeeZar;
  return 0;
}

export function shouldShowSuppliesLine(
  serviceDetails: Record<string, string | number | boolean>,
  options?: { serviceSlug?: ServiceSlug; showCleaningProductsQuestion?: boolean },
): boolean {
  const showQuestion =
    options?.showCleaningProductsQuestion ??
    (options?.serviceSlug ? serviceShowsCleaningProductsQuestion(options.serviceSlug) : true);
  if (!showQuestion) return false;
  const products = String(serviceDetails.cleaningProducts ?? "").trim().toLowerCase();
  return products === "yes" || products === "no";
}
