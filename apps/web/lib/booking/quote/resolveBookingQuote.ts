import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { buildBookingV2QuoteSignatureInputs } from "@/lib/booking/quote/validateBookingV2Quote";
import { quoteLockFromRequestBodyWithSnapshot, type LockQuoteError, type LockQuoteSuccess } from "@/lib/booking/bookingLockQuote";
import { calculateCustomerTotal, resolvePricedExtraIds } from "@/lib/booking-v2/calculateCustomerTotal";
import type { CustomerTotalInput } from "@/lib/booking-v2/types";
import {
  computeBookingQuoteSignature,
  type BookingQuoteSignaturePayload,
  verifyBookingQuoteSignature,
} from "@/lib/booking/quote/bookingQuoteSignature";
import { BOOKING_QUOTE_ENGINE_VERSION } from "@/lib/booking/quote/bookingQuoteEngineVersion";
import {
  BookingQuoteSyncError,
  type BookingQuoteEnvelope,
  type BookingV2QuoteResult,
  type LegacyBookingQuoteResult,
} from "@/lib/booking/quote/bookingQuoteTypes";
import {
  durationHoursFromMinutes,
  resolveBookingV2DurationWorkload,
  resolveLegacyJobDurationWorkload,
} from "@/lib/booking/quote/resolveBookingDurationWorkload";
import type { DurationWorkloadResult } from "@/lib/pricing/cleaningDurationWorkload";
import type { PricingJobInput } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { CheckoutQuoteResult } from "@/lib/pricing/pricingEngine";

function assertDurationPriceCoupling(input: {
  customer_price_zar: number;
  duration_workload: DurationWorkloadResult;
}): void {
  if (!Number.isFinite(input.customer_price_zar) || input.customer_price_zar < 0) {
    throw new BookingQuoteSyncError("Customer price is invalid.");
  }
  const minutes = input.duration_workload.duration_minutes;
  if (!Number.isFinite(minutes) || minutes < 1) {
    throw new BookingQuoteSyncError("Duration minutes is invalid.");
  }
}

export function buildBookingQuoteEnvelope(params: {
  funnel: "legacy" | "v2";
  customer_price_zar: number;
  duration_workload: DurationWorkloadResult;
  signatureInputs: Record<string, unknown>;
}): BookingQuoteEnvelope {
  assertDurationPriceCoupling(params);

  const duration_minutes = params.duration_workload.duration_minutes;
  const duration_hours = durationHoursFromMinutes(duration_minutes);
  const signaturePayload: BookingQuoteSignaturePayload = {
    funnel: params.funnel,
    customer_price_zar: params.customer_price_zar,
    duration_minutes,
    duration_hours,
    team_scaled_duration_minutes: params.duration_workload.team_scaled_duration_minutes,
    cleaner_workload: params.duration_workload.workload_weight,
    inputs: params.signatureInputs,
  };

  return {
    calculation_version: BOOKING_QUOTE_ENGINE_VERSION,
    duration_minutes,
    duration_hours,
    team_scaled_duration_minutes: params.duration_workload.team_scaled_duration_minutes,
    cleaner_workload: params.duration_workload.workload_weight,
    customer_price_zar: params.customer_price_zar,
    quote_signature: computeBookingQuoteSignature(signaturePayload),
    duration_workload: params.duration_workload,
  };
}

export function attachBookingQuoteEnvelopeToV2Breakdown(
  breakdown: CustomerPricingBreakdown,
  envelope: BookingQuoteEnvelope,
): CustomerPricingBreakdown {
  if (breakdown.estimated_total !== envelope.customer_price_zar) {
    throw new BookingQuoteSyncError(
      `Price/duration envelope mismatch: breakdown total R${breakdown.estimated_total} vs envelope R${envelope.customer_price_zar}.`,
    );
  }
  if (breakdown.estimated_duration_minutes !== envelope.duration_minutes) {
    throw new BookingQuoteSyncError(
      `Price/duration envelope mismatch: breakdown duration ${breakdown.estimated_duration_minutes}m vs envelope ${envelope.duration_minutes}m.`,
    );
  }

  return {
    ...breakdown,
    calculation_version: envelope.calculation_version,
    duration_hours: envelope.duration_hours,
    team_scaled_duration_minutes: envelope.team_scaled_duration_minutes,
    cleaner_workload: envelope.cleaner_workload,
    quote_signature: envelope.quote_signature,
  };
}

export function assertBookingQuoteEnvelopeIntegrity(
  envelope: BookingQuoteEnvelope,
  signatureInputs: Record<string, unknown>,
): void {
  const payload: BookingQuoteSignaturePayload = {
    funnel: "legacy",
    customer_price_zar: envelope.customer_price_zar,
    duration_minutes: envelope.duration_minutes,
    duration_hours: envelope.duration_hours,
    team_scaled_duration_minutes: envelope.team_scaled_duration_minutes,
    cleaner_workload: envelope.cleaner_workload,
    inputs: signatureInputs,
  };
  if (!verifyBookingQuoteSignature(payload, envelope.quote_signature)) {
    throw new BookingQuoteSyncError("Quote signature verification failed — price and duration may have diverged.");
  }
}

export type ResolveLegacyBookingQuoteResult =
  | (LockQuoteSuccess & { unified: LegacyBookingQuoteResult })
  | LockQuoteError;

/**
 * Legacy funnel: one server call returns checkout price + canonical duration + signed envelope.
 */
export function resolveLegacyBookingQuote(
  body: unknown,
  snapshot: PricingRatesSnapshot,
  options?: Parameters<typeof quoteLockFromRequestBodyWithSnapshot>[2],
): ResolveLegacyBookingQuoteResult {
  const quoted = quoteLockFromRequestBodyWithSnapshot(body, snapshot, options);
  if (!quoted.ok) return quoted;

  const teamMemberCount = quoted.quoteOptions.cleanersCount ?? 1;
  const duration_workload = resolveLegacyJobDurationWorkload(quoted.job, teamMemberCount, snapshot);
  const envelope = buildBookingQuoteEnvelope({
    funnel: "legacy",
    customer_price_zar: quoted.quote.totalZar,
    duration_workload,
    signatureInputs: legacySignatureInputs(quoted),
  });

  const checkout: CheckoutQuoteResult = {
    ...quoted.quote,
    hours: envelope.duration_hours,
  };

  return {
    ...quoted,
    quote: checkout,
    unified: {
      funnel: "legacy",
      checkout,
      ...envelope,
    },
  };
}

function legacySignatureInputs(quoted: LockQuoteSuccess): Record<string, unknown> {
  const j = quoted.job;
  return {
    job: {
      service: j.service,
      serviceType: j.serviceType ?? null,
      rooms: j.rooms,
      bathrooms: j.bathrooms,
      extraRooms: j.extraRooms,
      extras: [...j.extras].map((e) => e.trim()).filter(Boolean).sort(),
    },
    timeHm: quoted.timeHm,
    vipTier: quoted.vipTier,
    dynamicAdjustment: quoted.quoteOptions.dynamicAdjustment ?? null,
    cleanersCount: quoted.quoteOptions.cleanersCount ?? null,
    checkoutTotalZar: quoted.quote.totalZar,
  };
}

export function resolveLegacyBookingQuoteFromParts(params: {
  job: PricingJobInput;
  timeHm: string;
  vipTier: LockQuoteSuccess["vipTier"];
  quoteOptions: LockQuoteSuccess["quoteOptions"];
  checkout: CheckoutQuoteResult;
}): LegacyBookingQuoteResult {
  const teamMemberCount = params.quoteOptions.cleanersCount ?? 1;
  const duration_workload = resolveLegacyJobDurationWorkload(params.job, teamMemberCount);
  const envelope = buildBookingQuoteEnvelope({
    funnel: "legacy",
    customer_price_zar: params.checkout.totalZar,
    duration_workload,
    signatureInputs: {
      job: {
        service: params.job.service,
        serviceType: params.job.serviceType ?? null,
        rooms: params.job.rooms,
        bathrooms: params.job.bathrooms,
        extraRooms: params.job.extraRooms,
        extras: [...params.job.extras].map((e) => e.trim()).filter(Boolean).sort(),
      },
      timeHm: params.timeHm,
      vipTier: params.vipTier,
      dynamicAdjustment: params.quoteOptions.dynamicAdjustment ?? null,
      cleanersCount: params.quoteOptions.cleanersCount ?? null,
      checkoutTotalZar: params.checkout.totalZar,
    },
  });

  return {
    funnel: "legacy",
    checkout: { ...params.checkout, hours: envelope.duration_hours },
    ...envelope,
  };
}

export function resolveBookingV2Quote(input: CustomerTotalInput & { serviceSlug: ServiceSlug }): BookingV2QuoteResult {
  const canonicalInput = {
    ...input,
    selectedExtras: resolvePricedExtraIds(input.selectedExtras, input.catalog.extras),
  };
  const duration_workload = resolveBookingV2DurationWorkload({
    serviceSlug: canonicalInput.serviceSlug,
    serviceDetails: canonicalInput.serviceDetails,
    selectedExtras: canonicalInput.selectedExtras,
    cleanerMode: canonicalInput.cleanerMode,
    cleanerCount: canonicalInput.cleanerCount,
    durationLimits: {
      minHours: canonicalInput.catalog.minDurationHours,
      maxHours: canonicalInput.catalog.maxDurationHours,
    },
  });

  const breakdown = calculateCustomerTotal({
    ...canonicalInput,
    precomputedDurationWorkload: duration_workload,
  });

  const envelope = buildBookingQuoteEnvelope({
    funnel: "v2",
    customer_price_zar: breakdown.estimated_total,
    duration_workload,
    signatureInputs: buildBookingV2QuoteSignatureInputs(canonicalInput, breakdown),
  });

  return {
    funnel: "v2",
    breakdown: attachBookingQuoteEnvelopeToV2Breakdown(breakdown, envelope),
    ...envelope,
  };
}

export function verifyBookingV2QuoteBreakdown(
  breakdown: CustomerPricingBreakdown,
  signatureInputs: Record<string, unknown>,
): boolean {
  if (
    typeof breakdown.quote_signature !== "string" ||
    typeof breakdown.estimated_duration_minutes !== "number" ||
    typeof breakdown.estimated_total !== "number"
  ) {
    return false;
  }

  const duration_hours =
    typeof breakdown.duration_hours === "number"
      ? breakdown.duration_hours
      : durationHoursFromMinutes(breakdown.estimated_duration_minutes);

  return verifyBookingQuoteSignature(
    {
      funnel: "v2",
      customer_price_zar: breakdown.estimated_total,
      duration_minutes: breakdown.estimated_duration_minutes,
      duration_hours,
      team_scaled_duration_minutes:
        breakdown.team_scaled_duration_minutes ?? breakdown.estimated_duration_minutes,
      cleaner_workload: breakdown.cleaner_workload ?? 0,
      inputs: signatureInputs,
    },
    breakdown.quote_signature,
  );
}
