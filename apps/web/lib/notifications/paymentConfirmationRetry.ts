import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYMENT_CONFIRMATION_NOTIFICATION_JOB } from "@/lib/booking/failedJobs";
import { bookingHasAuthoritativeSettledPaymentStatus } from "@/lib/booking/bookingPaymentSettlementState";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

/** Notification-only recovery. Never replays settlement or starts a gateway charge. */
export async function processPaymentConfirmationRetries(admin: SupabaseClient) {
  const stats = { processed: 0, completed: 0, retained: 0, errors: 0 };
  const { data: jobs, error } = await admin.from("failed_jobs").select("id, payload, attempts")
    .eq("type", PAYMENT_CONFIRMATION_NOTIFICATION_JOB)
    .or(`payload->>notification_retry_at.is.null,payload->>notification_retry_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true }).limit(5);
  if (error) {
    await reportOperationalIssue("error", "payment_confirmation_retry", error.message);
    return { ...stats, errors: 1 };
  }
  const deadline = Date.now() + 60_000;
  for (const job of jobs ?? []) {
    if (Date.now() >= deadline) break;
    stats.processed++;
    const payload = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? job.payload as Record<string, unknown> : {};
    const bookingId = typeof payload.bookingId === "string" ? payload.bookingId : "";
    const reference = typeof payload.paymentReference === "string" ? payload.paymentReference : "";
    const amount = payload.amountCents;
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(bookingId) ||
        !reference || reference.length > 256 || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
      const { error: invalidError } = await admin.from("failed_jobs").update({
        type: `${PAYMENT_CONFIRMATION_NOTIFICATION_JOB}_invalid_payload`,
      }).eq("id", job.id);
      stats.errors++;
      await reportOperationalIssue("critical", "payment_confirmation_retry", invalidError?.message ?? "invalid retry payload quarantined", { failedJobId: job.id });
      continue;
    }
    try {
      const { data: booking, error: readError } = await admin.from("bookings")
        .select("status, payment_status, paystack_reference").eq("id", bookingId).maybeSingle();
      if (readError) throw new Error(readError.message);
      const stale = !booking || !bookingHasAuthoritativeSettledPaymentStatus(booking.payment_status) ||
        String(booking.status ?? "").toLowerCase() === "cancelled" ||
        Boolean(booking.paystack_reference && booking.paystack_reference !== reference);
      if (!stale) {
        const result = await notifyBookingEvent({ type: "payment_confirmed", supabase: admin,
          bookingId, paymentReference: reference, amountCents: amount,
          customerEmail: typeof payload.customerEmail === "string" ? payload.customerEmail : "",
          snapshot: payload.snapshot && typeof payload.snapshot === "object" && !Array.isArray(payload.snapshot)
            ? payload.snapshot as BookingSnapshotV1 : null,
          confirmationRetry: true,
        });
        if (result.failed) throw new Error(result.error ?? "confirmation_delivery_failed");
      } else {
        await logSystemEvent({ level: "info", source: "payment_confirmation_retry", message: "retired_stale_confirmation", context: { bookingId } });
      }
      const { error: deleteError } = await admin.from("failed_jobs").delete().eq("id", job.id);
      if (deleteError) throw new Error(deleteError.message);
      stats.completed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = Number(job.attempts ?? 0) + 1;
      const retryAt = new Date(Date.now() + Math.min(3600, 60 * 2 ** Math.min(attempts, 6)) * 1000).toISOString();
      const { error: updateError } = await admin.from("failed_jobs").update({
        attempts, payload: { ...payload, last_error: message.slice(0, 4000), notification_retry_at: retryAt },
      }).eq("id", job.id);
      stats.retained++;
      if (updateError) stats.errors++;
      if (attempts === 25 || updateError) await reportOperationalIssue("critical", "payment_confirmation_retry",
        updateError?.message ?? "confirmation retry requires operational attention", { bookingId, attempts });
    }
  }
  return stats;
}
