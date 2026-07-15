import type { CustomerPricingBreakdown, CustomerTotalInput } from "@/lib/booking-v2/types";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import {
  informationalFieldKeys,
  pricingRelevantFieldKeys,
  SERVICE_PRICING_CONTRACTS,
} from "@/lib/booking-v2/servicePricingContract";
import { canonicalizePricingServiceSlug } from "@/lib/booking-v2/resolvePricingServiceSlug";

export type QuoteConsumptionFailureCode =
  | "quote_missing_canonical_service"
  | "quote_missing_pricing_input"
  | "quote_stale_total"
  | "quote_duration_failed"
  | "quote_field_not_consumed";

export type QuoteConsumptionResult =
  | { ok: true; consumedKeys: string[] }
  | {
      ok: false;
      code: QuoteConsumptionFailureCode;
      error: string;
      missingKeys?: string[];
    };

function detailPresent(
  details: Record<string, string | number | boolean>,
  key: string,
): boolean {
  const v = details[key];
  if (v === undefined || v === null || v === "") return false;
  return true;
}

/**
 * Prove that every pricing-relevant visible field was either consumed into the
 * quote factor lines / room totals / extras, or is explicitly informational.
 */
export function assertQuotePricingInputsConsumed(params: {
  serviceSlug: ServiceSlug;
  quoteInput: CustomerTotalInput;
  breakdown: CustomerPricingBreakdown;
  /** Canonical pricing key expected (e.g. standard, move, office). */
  canonicalPricingKey?: string | null;
}): QuoteConsumptionResult {
  const { serviceSlug, quoteInput, breakdown } = params;
  const contract = SERVICE_PRICING_CONTRACTS[serviceSlug];
  if (!contract) {
    return {
      ok: false,
      code: "quote_missing_canonical_service",
      error: "Unknown service — cannot verify quote inputs.",
    };
  }

  const canonical =
    (params.canonicalPricingKey && canonicalizePricingServiceSlug(params.canonicalPricingKey)) ||
    contract.canonicalPricingKey;
  if (!canonical) {
    return {
      ok: false,
      code: "quote_missing_canonical_service",
      error: "Quote is missing a canonical service key.",
    };
  }

  if (
    typeof breakdown.estimated_duration_minutes !== "number" ||
    breakdown.estimated_duration_minutes < 1
  ) {
    return {
      ok: false,
      code: "quote_duration_failed",
      error: "Duration calculation failed. Adjust rooms or refresh pricing.",
    };
  }

  if (
    typeof breakdown.estimated_total !== "number" ||
    (breakdown.estimated_total <= 0 && (breakdown.base_service_price ?? 0) <= 0)
  ) {
    return {
      ok: false,
      code: "quote_stale_total",
      error: "Calculated total is missing or stale. Refresh pricing and try again.",
    };
  }

  const details = quoteInput.serviceDetails ?? {};
  const factorKeys = new Set(breakdown.factorLines?.map((l) => l.key) ?? []);
  // Room totals also "consume" bedrooms/bathrooms/extraRooms even when amount is 0
  // (studio bedrooms=0 is valid).
  const roomConsumed = new Set<string>();
  if ("bedrooms" in details) roomConsumed.add("bedrooms");
  if ("bathrooms" in details) roomConsumed.add("bathrooms");
  if ("extraRooms" in details) roomConsumed.add("extraRooms");
  if ("carpetRooms" in details) roomConsumed.add("carpetRooms");
  if ("rugCount" in details) roomConsumed.add("rugCount");
  if ("officeSize" in details) roomConsumed.add("officeSize");
  if ("moveType" in details) roomConsumed.add("moveType");
  if ("lastCleaned" in details) roomConsumed.add("lastCleaned");
  if ("furnished" in details) roomConsumed.add("furnished");
  if ("carpetType" in details) roomConsumed.add("carpetType");
  if ("stains" in details) roomConsumed.add("stains");
  if ("propertyType" in details) roomConsumed.add("propertyType");

  const relevant = pricingRelevantFieldKeys(serviceSlug);
  const informational = new Set(informationalFieldKeys(serviceSlug));
  const missing: string[] = [];
  const consumed: string[] = [];

  for (const key of relevant) {
    // Only enforce consumption for fields the customer actually answered.
    // Form-level required validation still blocks empty required fields earlier.
    if (!detailPresent(details, key)) {
      continue;
    }
    if (factorKeys.has(key) || roomConsumed.has(key) || informational.has(key)) {
      consumed.push(key);
      continue;
    }
    // moveType is consumed by rate selection even without a factor line.
    if (key === "moveType") {
      consumed.push(key);
      continue;
    }
    missing.push(key);
  }

  // Hard-require core quantity inputs for room/carpet/office services when present in contract.
  const coreRequired =
    serviceSlug === "carpet-cleaning"
      ? ["carpetRooms"]
      : serviceSlug === "office-cleaning"
        ? ["officeSize", "bathrooms"]
        : serviceSlug === "moving-cleaning" ||
            serviceSlug === "regular-cleaning" ||
            serviceSlug === "deep-cleaning" ||
            serviceSlug === "airbnb-cleaning"
          ? ["bathrooms"]
          : [];
  for (const key of coreRequired) {
    if (!detailPresent(details, key)) {
      missing.push(key);
    }
  }

  if (missing.length) {
    return {
      ok: false,
      code: "quote_missing_pricing_input",
      error: `Required pricing input missing or not applied: ${[...new Set(missing)].join(", ")}.`,
      missingKeys: [...new Set(missing)],
    };
  }

  // Detect silently ignored price_and_duration fields that were answered but
  // never appeared in factors when a positive amount was expected.
  for (const key of relevant) {
    if (!detailPresent(details, key)) continue;
    if (key === "bedrooms" || key === "bathrooms" || key === "extraRooms" || key === "carpetRooms") {
      const n = Math.floor(Number(details[key]));
      const rate =
        key === "bathrooms"
          ? quoteInput.catalog.pricePerBathroom
          : key === "extraRooms"
            ? quoteInput.catalog.pricePerExtraRoom
            : quoteInput.catalog.pricePerBedroom;
      if (n > 0 && rate > 0) {
        const linePresent =
          factorKeys.has(key) ||
          (key === "bedrooms" && breakdown.bedrooms_price > 0) ||
          (key === "bathrooms" && breakdown.bathrooms_price > 0) ||
          (key === "extraRooms" && breakdown.extra_rooms_price > 0) ||
          (key === "carpetRooms" && breakdown.property_size_price > 0);
        if (!linePresent) {
          return {
            ok: false,
            code: "quote_field_not_consumed",
            error: `${key} was provided but did not affect the quote. Refresh pricing.`,
            missingKeys: [key],
          };
        }
      }
    }
  }

  return { ok: true, consumedKeys: consumed };
}
