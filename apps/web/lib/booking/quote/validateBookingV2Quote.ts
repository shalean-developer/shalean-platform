import type { CustomerPricingBreakdown, CustomerTotalInput } from "@/lib/booking-v2/types";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { verifyBookingV2QuoteBreakdown } from "@/lib/booking/quote/resolveBookingQuote";

const MAX_PRICE_DRIFT_RATIO = 0.01;
const MAX_DURATION_DRIFT_RATIO = 0.01;

export type V2QuoteValidationFailure = {
  ok: false;
  status: 422;
  error: string;
  code:
    | "quote_recompute_failed"
    | "quote_signature_missing"
    | "quote_signature_invalid"
    | "quote_client_signature_mismatch"
    | "quote_price_drift"
    | "quote_duration_drift";
};

export type V2QuoteValidationSuccess = { ok: true };

export type V2QuoteValidationResult = V2QuoteValidationSuccess | V2QuoteValidationFailure;

export function buildBookingV2QuoteSignatureInputs(
  input: CustomerTotalInput & { serviceSlug: ServiceSlug },
  breakdown: CustomerPricingBreakdown,
): Record<string, unknown> {
  return {
    serviceSlug: input.serviceSlug,
    serviceDetails: input.serviceDetails,
    selectedExtras: [...input.selectedExtras].sort(),
    cleanerMode: input.cleanerMode,
    cleanerCount: input.cleanerCount,
    bookingType: input.bookingType,
    recurringFrequency: input.recurringFrequency,
    equipmentRequired: Boolean(input.equipmentRequired),
    equipmentLogisticsFee: breakdown.equipment_logistics_fee,
    estimatedTotal: breakdown.estimated_total,
  };
}

export function assertV2ConfirmQuoteIntegrity(params: {
  serverBreakdown: CustomerPricingBreakdown | null | undefined;
  catalogLoaded: boolean;
  clientPricingSummary: CustomerPricingBreakdown & { total?: number };
  quoteInput: CustomerTotalInput & { serviceSlug: ServiceSlug };
}): V2QuoteValidationResult {
  const { serverBreakdown, catalogLoaded, clientPricingSummary, quoteInput } = params;

  if (!catalogLoaded || !serverBreakdown) {
    return {
      ok: false,
      status: 422,
      error: "We could not verify your quote. Please refresh and try again.",
      code: "quote_recompute_failed",
    };
  }

  if (
    !serverBreakdown.quote_signature ||
    typeof serverBreakdown.estimated_duration_minutes !== "number" ||
    serverBreakdown.estimated_duration_minutes < 1 ||
    typeof serverBreakdown.estimated_total !== "number" ||
    serverBreakdown.estimated_total < 0
  ) {
    return {
      ok: false,
      status: 422,
      error: "We could not verify your quote. Please refresh and try again.",
      code: "quote_signature_missing",
    };
  }

  const signatureInputs = buildBookingV2QuoteSignatureInputs(quoteInput, serverBreakdown);
  if (!verifyBookingV2QuoteBreakdown(serverBreakdown, signatureInputs)) {
    return {
      ok: false,
      status: 422,
      error: "We could not verify your quote. Please refresh and try again.",
      code: "quote_signature_invalid",
    };
  }

  const clientSignature =
    typeof clientPricingSummary.quote_signature === "string"
      ? clientPricingSummary.quote_signature.trim()
      : "";
  if (clientSignature && clientSignature !== serverBreakdown.quote_signature) {
    return {
      ok: false,
      status: 422,
      error: "Your quote changed on our server. Please refresh pricing and try again.",
      code: "quote_client_signature_mismatch",
    };
  }

  const clientTotal =
    typeof clientPricingSummary.estimated_total === "number"
      ? clientPricingSummary.estimated_total
      : clientPricingSummary.total;
  const serverTotal = serverBreakdown.estimated_total;

  if (typeof clientTotal === "number" && clientTotal > 0 && serverTotal > 0) {
    const priceDrift = Math.abs(serverTotal - clientTotal) / serverTotal;
    if (priceDrift > MAX_PRICE_DRIFT_RATIO) {
      return {
        ok: false,
        status: 422,
        error: "The price for your booking changed. Please refresh and try again.",
        code: "quote_price_drift",
      };
    }
  }

  const clientDuration = clientPricingSummary.estimated_duration_minutes;
  if (
    typeof clientDuration === "number" &&
    clientDuration > 0 &&
    serverTotal > 0
  ) {
    const durationDrift =
      Math.abs(clientDuration - serverBreakdown.estimated_duration_minutes) /
      serverBreakdown.estimated_duration_minutes;
    if (durationDrift > MAX_DURATION_DRIFT_RATIO) {
      return {
        ok: false,
        status: 422,
        error: "The scheduled duration for your booking changed. Please refresh and try again.",
        code: "quote_duration_drift",
      };
    }
  }

  return { ok: true };
}
