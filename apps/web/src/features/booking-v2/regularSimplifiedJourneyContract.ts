import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingStep, BookingV2FormData } from "@/src/features/booking-v2/types";

/**
 * FCO-01-C1: feature-contract only. No UI, routing, payment, or booking-flow
 * code consumes this module yet. The existing journey remains unchanged.
 *
 * Explicit environment and flag arguments avoid implicit production rollout.
 * Even a misconfigured production flag cannot enable the experiment.
 */
export type FcoEnvironment = "development" | "staging" | "production";

export function isRegularSimplifiedJourneyEnabled(input: {
  serviceSlug: ServiceSlug;
  environment: FcoEnvironment;
  enabled: boolean;
}): boolean {
  return input.serviceSlug === "regular-cleaning" &&
    input.environment !== "production" &&
    input.enabled === true;
}

/** Keep canonical internal four-step URLs, booking engine and payment step. */
export const REGULAR_SIMPLIFIED_STAGE_CONTRACT = [
  { step: 1, key: "home", label: "Your home", query: "details" },
  { step: 2, key: "schedule", label: "Schedule", query: "schedule" },
  { step: 3, key: "contact_review", label: "Your details", query: "review" },
  { step: 4, key: "payment", label: "Payment", query: "payment" },
] as const satisfies ReadonlyArray<{
  step: BookingStep;
  key: string;
  label: string;
  query: string;
}>;

export type RegularSimplifiedStageKey =
  (typeof REGULAR_SIMPLIFIED_STAGE_CONTRACT)[number]["key"];

export const REGULAR_HOME_REQUIRED_FIELDS = [
  "serviceDetails.propertyType",
  "serviceDetails.bedrooms",
  "serviceDetails.bathrooms",
  "serviceDetails.extraRooms",
  "serviceDetails.hasPets",
  "equipmentRequired",
  "suburb",
  "serviceAreaLocationId",
] as const;

export const REGULAR_DEFERRED_DETAILS_FIELDS = [
  "address",
  "contactPhone",
  "accessInstructions",
  "parkingInstructions",
  "gateCode",
] as const;

/**
 * An unanswered extra-room question differs from an explicitly chosen 0.
 * The new UI must not silently preselect the equipment responsibility.
 */
export function regularHomeAnswersComplete(
  values: Pick<BookingV2FormData, "serviceDetails" | "equipmentRequired" | "suburb" | "serviceAreaLocationId">,
): boolean {
  const detailKeys = ["propertyType", "bedrooms", "bathrooms", "extraRooms", "hasPets"] as const;
  return detailKeys.every((key) => {
    const value = values.serviceDetails[key];
    return value !== null && value !== undefined && String(value).trim() !== "";
  }) &&
    (values.equipmentRequired === "yes" || values.equipmentRequired === "no") &&
    values.suburb.trim().length >= 2 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(values.serviceAreaLocationId.trim());
}

/** Stage 3 must never omit address-dependent equipment logistics. */
export function regularEquipmentQuoteReady(input: {
  equipmentRequired: BookingV2FormData["equipmentRequired"];
  equipmentQuote: BookingV2FormData["equipmentQuote"];
}): boolean {
  if (input.equipmentRequired === "no") return true;
  if (input.equipmentRequired !== "yes") return false;
  const quote = input.equipmentQuote;
  return quote != null &&
    quote.manual_quote_required === false &&
    quote.geocode_error !== true &&
    Number.isFinite(quote.logistics_fee) &&
    quote.logistics_fee >= 0;
}

/**
 * Shared browser-build flag. No production deployment can opt in: the production
 * environment is always denied even if the preview variable is accidentally set.
 */
export function regularSimplifiedPreviewEnabled(serviceSlug: ServiceSlug): boolean {
  const environment: FcoEnvironment =
    process.env.NEXT_PUBLIC_SHALEAN_APP_ENV === "staging" ? "staging" :
    process.env.NEXT_PUBLIC_SHALEAN_APP_ENV === "development" ? "development" : "production";
  return isRegularSimplifiedJourneyEnabled({
    serviceSlug,
    environment,
    enabled: process.env.NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW === "true",
  });
}
