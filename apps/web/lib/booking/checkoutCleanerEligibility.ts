import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FALLBACK_REASON_CLEANER_NOT_AVAILABLE,
  FALLBACK_REASON_CLEANER_OFFLINE,
  FALLBACK_REASON_INVALID_CLEANER_ID,
  type BookingFallbackReason,
} from "@/lib/booking/fallbackReason";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { isCleanerInAvailablePoolForSlot } from "@/lib/booking/availabilityEngine";

export type CheckoutCleanerResolution =
  | { kind: "no_pick" }
  | { kind: "honor"; cleanerId: string }
  | { kind: "fallback"; attemptedId: string; reason: BookingFallbackReason };

/** TTL (seconds) for checkout dispatch offers (user-selected cleaner). Env: `DISPATCH_CHECKOUT_OFFER_TTL_SECONDS` (60–86400). */
export function checkoutDispatchOfferTtlSeconds(): number {
  const raw = Number(process.env.DISPATCH_CHECKOUT_OFFER_TTL_SECONDS);
  if (Number.isFinite(raw) && raw >= 60 && raw <= 24 * 60 * 60) return Math.round(raw);
  return 2 * 60 * 60;
}

export function checkoutDurationMinutesFromLocked(locked: LockedBooking | null): number {
  if (!locked) return 120;
  const hours = locked.duration ?? locked.finalHours;
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    return Math.max(30, Math.round(hours * 60));
  }
  return 120;
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

  const isActive = (row as { is_active?: boolean | null }).is_active !== false;
  const isAvailFlag = (row as { is_available?: boolean | null }).is_available !== false;
  const status = String((row as { status?: string | null }).status ?? "").toLowerCase();

  if (!isActive) {
    return { kind: "fallback", attemptedId: picked, reason: FALLBACK_REASON_CLEANER_NOT_AVAILABLE };
  }
  if (status === "offline") {
    return { kind: "fallback", attemptedId: picked, reason: FALLBACK_REASON_CLEANER_OFFLINE };
  }
  if (status === "busy") {
    return { kind: "fallback", attemptedId: picked, reason: FALLBACK_REASON_CLEANER_NOT_AVAILABLE };
  }
  if (!isAvailFlag) {
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
    });
    if (!inPool) {
      return { kind: "fallback", attemptedId: picked, reason: FALLBACK_REASON_CLEANER_NOT_AVAILABLE };
    }
  }

  return { kind: "honor", cleanerId: picked };
}
