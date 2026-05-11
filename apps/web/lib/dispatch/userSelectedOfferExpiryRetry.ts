import type { SupabaseClient } from "@supabase/supabase-js";
import { isCleanerInAvailablePoolForSlot } from "@/lib/booking/availabilityEngine";
import { resolveBookingServiceSlugFromStoredService } from "@/lib/booking/canonicalSlotEligibilityParams";
import { checkoutDispatchOfferTtlSeconds } from "@/lib/booking/checkoutCleanerEligibility";
import { escalateFailedCheckoutDispatchOffer } from "@/lib/booking/checkoutDispatchOfferFailureEscalation";
import { checkoutDurationMinutesFromLocked } from "@/lib/booking/lockedBookingDurationMinutes";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

const REDISPATCH_ELIGIBLE_BOOKING_STATUSES = ["pending", "pending_assignment", "offered"] as const;

export type SameCleanerExpiryRetryResult =
  /** A new pending offer row was created for the selected cleaner (first expiry only). */
  | { kind: "retry_offer_created" }
  /** Caller should run fallback auto-assign ({@link maybeRedispatchPendingBookingIfOffersExhausted}). */
  | { kind: "proceed_fallback" };

function isEligibleBookingStatus(st: string): boolean {
  return (REDISPATCH_ELIGIBLE_BOOKING_STATUSES as readonly string[]).includes(st);
}

function isUniquePendingOfferViolation(msg: string): boolean {
  return /duplicate key|unique constraint|dispatch_offers_booking_cleaner_pending/i.test(msg);
}

/**
 * After the SQL TTL expiry job marks the checkout offer `expired`, attempt **one** new offer to the same
 * `selected_cleaner_id` when exactly **one** expired row exists for that (booking, cleaner).
 *
 * Policy:
 * - First expiry → retry same cleaner once if still slot-eligible (existing pool rules via {@link isCleanerInAvailablePoolForSlot}).
 * - Second+ expiry, ineligible cleaner, or insert failure → {@link SameCleanerExpiryRetryResult.kind} `proceed_fallback`.
 *
 * Idempotency: unique partial index on `(booking_id, cleaner_id)` where `status='pending'` prevents duplicate pending offers;
 * concurrent recovery treats duplicate insert as success if a pending offer exists.
 */
export async function maybeRetrySameCleanerAfterFirstOfferExpiry(
  supabase: SupabaseClient,
  params: { bookingId: string; selectedCleanerId: string },
): Promise<SameCleanerExpiryRetryResult> {
  const bookingId = params.bookingId.trim();
  const selectedCleanerId = params.selectedCleanerId.trim();
  if (!bookingId || !selectedCleanerId) return { kind: "proceed_fallback" };

  const { count: pendingCount, error: pendErr } = await supabase
    .from("dispatch_offers")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("status", "pending");

  if (pendErr) {
    await reportOperationalIssue("warn", "userSelectedOfferExpiryRetry", `pending offers count: ${pendErr.message}`, {
      bookingId,
    });
    return { kind: "proceed_fallback" };
  }
  if ((pendingCount ?? 0) > 0) {
    return { kind: "proceed_fallback" };
  }

  const { data: b, error: bErr } = await supabase
    .from("bookings")
    .select(
      "id, status, cleaner_id, assignment_type, selected_cleaner_id, dispatch_attempt_count, date, time, duration_minutes, location_id, service_slug, service, booking_snapshot, paystack_reference",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !b || typeof b !== "object") return { kind: "proceed_fallback" };

  const st = String((b as { status?: string }).status ?? "").toLowerCase();
  if (!isEligibleBookingStatus(st)) return { kind: "proceed_fallback" };
  if ((b as { cleaner_id?: string | null }).cleaner_id) return { kind: "proceed_fallback" };

  const at = String((b as { assignment_type?: string | null }).assignment_type ?? "").toLowerCase();
  if (at !== "user_selected") return { kind: "proceed_fallback" };

  const sel = String((b as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? "").trim();
  if (sel !== selectedCleanerId) return { kind: "proceed_fallback" };

  const { count: expiredCount, error: expErr } = await supabase
    .from("dispatch_offers")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("cleaner_id", selectedCleanerId)
    .eq("status", "expired");

  if (expErr) {
    await reportOperationalIssue("warn", "userSelectedOfferExpiryRetry", `expired offers count: ${expErr.message}`, {
      bookingId,
    });
    return { kind: "proceed_fallback" };
  }

  const expired = expiredCount ?? 0;
  if (expired !== 1) {
    return { kind: "proceed_fallback" };
  }

  const row = b as {
    date?: string | null;
    time?: string | null;
    duration_minutes?: number | null;
    location_id?: string | null;
    service_slug?: string | null;
    service?: string | null;
    booking_snapshot?: unknown;
    dispatch_attempt_count?: number | null;
    paystack_reference?: string | null;
  };

  const date = String(row.date ?? "").trim().slice(0, 10);
  const time = String(row.time ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) {
    return { kind: "proceed_fallback" };
  }

  const locked = parseLockedBookingFromUnknown(row.booking_snapshot);
  const durationMinutes =
    typeof row.duration_minutes === "number" && Number.isFinite(row.duration_minutes) && row.duration_minutes > 0
      ? Math.round(row.duration_minutes)
      : checkoutDurationMinutesFromLocked(locked);

  const locationId =
    (locked?.serviceAreaLocationId != null && String(locked.serviceAreaLocationId).trim()) ||
    (row.location_id != null && String(row.location_id).trim()) ||
    null;

  const bookingServiceSlug = resolveBookingServiceSlugFromStoredService(row.service ?? null);
  const serviceLabelForCapability = typeof row.service === "string" ? row.service : null;

  const stillEligible = await isCleanerInAvailablePoolForSlot(supabase, {
    cleanerId: selectedCleanerId,
    selectedDate: date,
    selectedTime: time,
    durationMinutes,
    locationId,
    bookingServiceSlug,
    serviceLabelForCapability,
  });

  if (!stillEligible) {
    await logSystemEvent({
      level: "info",
      source: "user_selected_offer_expiry_retry",
      message: "Same-cleaner retry skipped — cleaner no longer eligible for slot",
      context: { bookingId, cleanerId: selectedCleanerId },
    });
    return { kind: "proceed_fallback" };
  }

  const ttl = checkoutDispatchOfferTtlSeconds();
  const attemptNum =
    typeof row.dispatch_attempt_count === "number" && Number.isFinite(row.dispatch_attempt_count)
      ? Math.max(0, Math.floor(row.dispatch_attempt_count))
      : 0;

  const offerRes = await createDispatchOfferRow({
    supabase,
    bookingId,
    cleanerId: selectedCleanerId,
    rankIndex: 0,
    ttlSeconds: ttl,
    metricAttemptNumber: attemptNum,
  });

  if (offerRes.ok) {
    metrics.increment("dispatch.offer.expiry_same_cleaner_retry", {
      bookingId,
      cleanerId: selectedCleanerId,
      offerId: offerRes.offerId,
    });
    await logSystemEvent({
      level: "info",
      source: "user_selected_offer_expiry_retry",
      message: "Re-sent dispatch offer to same selected cleaner after first expiry",
      context: { bookingId, cleanerId: selectedCleanerId, offerId: offerRes.offerId },
    });
    return { kind: "retry_offer_created" };
  }

  if (isUniquePendingOfferViolation(offerRes.error)) {
    const { count: pendingAfter, error: paErr } = await supabase
      .from("dispatch_offers")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId)
      .eq("status", "pending");
    if (!paErr && (pendingAfter ?? 0) > 0) {
      return { kind: "retry_offer_created" };
    }
  }

  const ref = String(row.paystack_reference ?? "").trim() || "unknown";
  await escalateFailedCheckoutDispatchOffer({
    supabase,
    bookingId,
    paystackReference: ref,
    cleanerId: selectedCleanerId,
    offerError: offerRes.error,
  });

  return { kind: "proceed_fallback" };
}
