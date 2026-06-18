import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { escalateFailedCheckoutDispatchOffer } from "@/lib/booking/checkoutDispatchOfferFailureEscalation";
import { dispatchFallbackAfterSelectedCleanerOfferInsertFailure } from "@/lib/booking/checkoutDispatchOfferFailureFallback";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { ensureBookingAssignment, type EnsureAssignmentSource } from "@/lib/dispatch/ensureBookingAssignment";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import {
  classifyPreferredDispatchContext,
  computePreferredOfferExpiresAt,
  preferredOfferTtlSeconds,
  type PreferredDispatchStatus,
} from "@/lib/dispatch/preferredCleanerDispatchPolicy";
import {
  finalizePreferredDispatchOnOfferAccept,
  markPreferredOfferExpiredOnBooking,
  setPreferredDispatchStatus,
} from "@/lib/dispatch/preferredCleanerDispatchStatus";
import { notifyCustomerPreferredCleanerSkippedUrgent } from "@/lib/notifications/customerUserNotifications";

export {
  PREFERRED_CLEANER_CUSTOMER_DISCLAIMER,
  PREFERRED_CLEANER_UNAVAILABLE_URGENT_MESSAGE,
  PREFERRED_DISPATCH_STATUSES,
  PREFERRED_SKIP_MINUTES,
  classifyPreferredDispatchContext,
  computePreferredOfferExpiresAt,
  isPreferredOfferUrgent,
  preferredDispatchStatusAdminLabel,
  preferredOfferTtlSeconds,
  type PreferredDispatchContext,
  type PreferredDispatchStatus,
} from "@/lib/dispatch/preferredCleanerDispatchPolicy";

export {
  finalizePreferredDispatchOnOfferAccept,
  markPreferredOfferExpiredOnBooking,
  setPreferredDispatchStatus,
};

export async function startBackupDispatchForPreferredBooking(
  supabase: SupabaseClient,
  params: { bookingId: string; excludeCleanerId: string; source: EnsureAssignmentSource },
): Promise<{ ok: boolean; error?: string }> {
  await setPreferredDispatchStatus(supabase, params.bookingId, "backup_dispatch_started");

  if (process.env.AUTO_DISPATCH_CLEANERS === "false") {
    return { ok: false, error: "AUTO_DISPATCH_CLEANERS=false" };
  }

  const r = await ensureBookingAssignment(supabase, params.bookingId, {
    source: params.source,
    smartAssign: { excludeCleanerIds: [params.excludeCleanerId] },
  });

  if (!r.ok) {
    return { ok: false, error: r.error ?? r.message ?? "backup_dispatch_failed" };
  }

  await setPreferredDispatchStatus(supabase, params.bookingId, "backup_offer_pending");
  return { ok: true };
}

export type StartPreferredCleanerDispatchResult =
  | { kind: "preferred_offer_sent"; offerId: string; expiresAtIso: string }
  | { kind: "skipped_urgent"; backupOk: boolean }
  | { kind: "offer_failed"; error: string };

/**
 * Post-payment entry: offer preferred cleaner first, or skip straight to backup when job starts within 2h.
 */
export async function startPreferredCleanerDispatchAfterPayment(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    preferredCleanerId: string;
    dateYmd: string;
    timeHm: string;
    bookingPriority?: string | null;
    paystackReference: string;
    dispatchAttemptCount?: number;
  },
): Promise<StartPreferredCleanerDispatchResult> {
  const bookingId = params.bookingId.trim();
  const preferredCleanerId = params.preferredCleanerId.trim();
  const dateYmd = params.dateYmd.trim().slice(0, 10);
  const timeHm = params.timeHm.trim();
  if (!bookingId || !preferredCleanerId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !timeHm) {
    return { kind: "offer_failed", error: "invalid_preferred_dispatch_params" };
  }

  const sentAt = new Date();
  const context = classifyPreferredDispatchContext({
    dateYmd,
    timeHm,
    bookingPriority: params.bookingPriority,
    now: sentAt,
  });

  if (context === "skip_within_2_hours") {
    await setPreferredDispatchStatus(supabase, bookingId, "preferred_cleaner_skipped_urgent");
    void notifyCustomerPreferredCleanerSkippedUrgent(supabase, bookingId);
    await logSystemEvent({
      level: "info",
      source: "preferred_cleaner_dispatch",
      message: "Preferred cleaner skipped — booking starts within 2 hours",
      context: { bookingId, preferredCleanerId },
    });
    metrics.increment("dispatch.preferred.skipped_urgent", { bookingId, preferredCleanerId });
    const backup = await startBackupDispatchForPreferredBooking(supabase, {
      bookingId,
      excludeCleanerId: preferredCleanerId,
      source: "preferred_skipped_urgent",
    });
    return { kind: "skipped_urgent", backupOk: backup.ok };
  }

  const expiresAt = computePreferredOfferExpiresAt({
    sentAt,
    dateYmd,
    timeHm,
    bookingPriority: params.bookingPriority,
  });
  const ttlSeconds = preferredOfferTtlSeconds(sentAt, expiresAt);
  const attemptNum =
    typeof params.dispatchAttemptCount === "number" && Number.isFinite(params.dispatchAttemptCount)
      ? Math.max(0, Math.floor(params.dispatchAttemptCount))
      : 0;

  const offerRes = await createDispatchOfferRow({
    supabase,
    bookingId,
    cleanerId: preferredCleanerId,
    rankIndex: 0,
    ttlSeconds,
    expiresAtIso: expiresAt.toISOString(),
    offerType: "preferred",
    metricAttemptNumber: attemptNum,
  });

  if (!offerRes.ok) {
    await escalateFailedCheckoutDispatchOffer({
      supabase,
      bookingId,
      paystackReference: params.paystackReference,
      cleanerId: preferredCleanerId,
      offerError: offerRes.error,
    });
    await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId,
      paystackReference: params.paystackReference,
      failedSelectedCleanerId: preferredCleanerId,
    });
    return { kind: "offer_failed", error: offerRes.error };
  }

  await setPreferredDispatchStatus(supabase, bookingId, "preferred_cleaner_pending");
  metrics.increment("dispatch.preferred.offer_sent", {
    bookingId,
    preferredCleanerId,
    offerId: offerRes.offerId,
    context,
  });

  return { kind: "preferred_offer_sent", offerId: offerRes.offerId, expiresAtIso: offerRes.expiresAtIso };
}
