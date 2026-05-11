import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FALLBACK_REASON_CLEANER_NOT_AVAILABLE,
  FALLBACK_REASON_CLEANER_OFFLINE,
  FALLBACK_REASON_INVALID_CLEANER_ID,
  type BookingFallbackReason,
} from "@/lib/booking/fallbackReason";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { resolveBookingServiceSlugFromStoredService } from "@/lib/booking/canonicalSlotEligibilityParams";
import { isCleanerInAvailablePoolForSlot } from "@/lib/booking/availabilityEngine";
import { cleanerAccountEligibleForCustomerBooking } from "@/lib/booking/cleanerSlotEligibility";
import { checkoutDurationMinutesFromLocked } from "@/lib/booking/lockedBookingDurationMinutes";

export { checkoutDurationMinutesFromLocked };

export type CheckoutCleanerResolution =
  | { kind: "no_pick" }
  | { kind: "honor"; cleanerId: string }
  | { kind: "fallback"; attemptedId: string; reason: BookingFallbackReason };

/**
 * After successful payment, this is the cleaner who should receive the checkout dispatch offer.
 * `honor` uses pre-pay eligibility; `fallback` still targets the customer's pick so they can accept/decline in-app.
 */
export function checkoutPaidDispatchOfferCleanerId(input: {
  checkoutResolution: CheckoutCleanerResolution;
  userConfirmedCleanerId: string | null;
  normalizedPickedCleaner: string | null;
}): string | null {
  if (input.userConfirmedCleanerId) return input.userConfirmedCleanerId;
  if (input.checkoutResolution.kind === "fallback" && input.normalizedPickedCleaner) {
    return input.normalizedPickedCleaner;
  }
  return null;
}

/** Default TTL (seconds) for checkout dispatch offers (selected cleaner, post-payment offer only). */
export const DISPATCH_CHECKOUT_OFFER_TTL_DEFAULT_SECONDS = 3600;

const CHECKOUT_OFFER_TTL_MIN = 60;
const CHECKOUT_OFFER_TTL_MAX = 24 * 60 * 60;

/**
 * TTL (seconds) for checkout dispatch offers (user-selected cleaner).
 * Env: `DISPATCH_CHECKOUT_OFFER_TTL_SECONDS` — unset uses {@link DISPATCH_CHECKOUT_OFFER_TTL_DEFAULT_SECONDS};
 * invalid non-numeric uses default; out-of-range numeric values clamp to 60–86400.
 */
export function checkoutDispatchOfferTtlSeconds(): number {
  const rawStr = String(process.env.DISPATCH_CHECKOUT_OFFER_TTL_SECONDS ?? "").trim();
  if (!rawStr) return DISPATCH_CHECKOUT_OFFER_TTL_DEFAULT_SECONDS;
  const raw = Number(rawStr);
  if (!Number.isFinite(raw)) return DISPATCH_CHECKOUT_OFFER_TTL_DEFAULT_SECONDS;
  if (raw < CHECKOUT_OFFER_TTL_MIN) return CHECKOUT_OFFER_TTL_MIN;
  if (raw > CHECKOUT_OFFER_TTL_MAX) return CHECKOUT_OFFER_TTL_MAX;
  return Math.floor(raw);
}

/**
 * Decide whether checkout can assign the customer’s chosen cleaner, or should auto-dispatch with a traceable reason.
 */
export async function resolveCheckoutCleanerSelection(
  admin: SupabaseClient,
  input: {
    pickedCleanerUuid: string | null;
    locked: LockedBooking | null;
  },
): Promise<CheckoutCleanerResolution> {
  const picked = input.pickedCleanerUuid?.trim() || null;
  if (!picked) return { kind: "no_pick" };

  const { data: row, error } = await admin
    .from("cleaners")
    .select("id, is_available, is_active, status")
    .eq("id", picked)
    .maybeSingle();

  if (error || !row || typeof row !== "object" || !("id" in row)) {
    return { kind: "fallback", attemptedId: picked, reason: FALLBACK_REASON_INVALID_CLEANER_ID };
  }

  const status = String((row as { status?: string | null }).status ?? "").toLowerCase();

  if (!cleanerAccountEligibleForCustomerBooking(row as { is_active?: boolean | null; is_available?: boolean | null; status?: string | null })) {
    if (status === "offline") {
      return { kind: "fallback", attemptedId: picked, reason: FALLBACK_REASON_CLEANER_OFFLINE };
    }
    return { kind: "fallback", attemptedId: picked, reason: FALLBACK_REASON_CLEANER_NOT_AVAILABLE };
  }

  const date = input.locked?.date?.trim() ?? "";
  const time = input.locked?.time?.trim() ?? "";
  if (date && time && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const durationMinutes = checkoutDurationMinutesFromLocked(input.locked);
    const inPool = await isCleanerInAvailablePoolForSlot(admin, {
      cleanerId: picked,
      selectedDate: date,
      selectedTime: time,
      durationMinutes,
      locationId: input.locked?.serviceAreaLocationId ?? null,
      bookingServiceSlug: resolveBookingServiceSlugFromStoredService(input.locked?.service),
    });
    if (!inPool) {
      return { kind: "fallback", attemptedId: picked, reason: FALLBACK_REASON_CLEANER_NOT_AVAILABLE };
    }
  }

  return { kind: "honor", cleanerId: picked };
}
