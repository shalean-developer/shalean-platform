import crypto from "crypto";
import { resolveBookingLockHmacSecretForSigning } from "@/lib/booking/bookingLockHmacSecret";
import { BOOKING_QUOTE_ENGINE_VERSION } from "@/lib/booking/quote/bookingQuoteEngineVersion";
import type { BookingQuoteFunnel } from "@/lib/booking/quote/bookingQuoteTypes";
import { PRICING_ENGINE_ALGORITHM_VERSION } from "@/lib/pricing/engineVersion";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export type BookingQuoteSignaturePayload = {
  funnel: BookingQuoteFunnel;
  customer_price_zar: number;
  duration_minutes: number;
  duration_hours: number;
  team_scaled_duration_minutes: number;
  cleaner_workload: number;
  /** Funnel-specific inputs that must reproduce the same quote. */
  inputs: Record<string, unknown>;
};

export function buildBookingQuoteSignString(payload: BookingQuoteSignaturePayload): string {
  const canonical = {
    quoteEngine: BOOKING_QUOTE_ENGINE_VERSION,
    pricingAlgorithm: PRICING_ENGINE_ALGORITHM_VERSION,
    funnel: payload.funnel,
    customer_price_zar: payload.customer_price_zar,
    duration_minutes: payload.duration_minutes,
    duration_hours: Number(payload.duration_hours.toFixed(4)),
    team_scaled_duration_minutes: payload.team_scaled_duration_minutes,
    cleaner_workload: Number(payload.cleaner_workload.toFixed(4)),
    inputs: payload.inputs,
  };
  return stableStringify(canonical);
}

export function signBookingQuoteCanonical(canonical: string): string {
  const secret = resolveBookingLockHmacSecretForSigning();
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

export function computeBookingQuoteSignature(payload: BookingQuoteSignaturePayload): string {
  return signBookingQuoteCanonical(buildBookingQuoteSignString(payload));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function verifyBookingQuoteSignature(
  payload: BookingQuoteSignaturePayload,
  signature: string | null | undefined,
): boolean {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature.trim())) return false;
  const expected = computeBookingQuoteSignature(payload);
  return timingSafeEqualHex(expected, signature.trim());
}
