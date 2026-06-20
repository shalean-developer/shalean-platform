import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { cancelUnsentBookingLifecycleJobs } from "@/lib/booking/cancelUnsentBookingLifecycleJobs";
import { cancelUnsentBookingPaymentRecoveryJobs } from "@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs";
import { LIFECYCLE_SKIP } from "@/lib/booking/lifecycleEmailSkipReasons";
import { PAYMENT_RECOVERY_SKIP } from "@/lib/booking/paymentRecoverySkipReasons";
import {
  sendAdminBookingCancelledEmail,
  sendCustomerBookingCancelledEmail,
} from "@/lib/email/sendBookingEmail";
import { sendCleanerBookingCancelledEmail } from "@/lib/email/sendCleanerNotification";
import { buildBookingNotifyMessageFields, formatBookingNotifyPlainLines } from "@/lib/notifications/bookingNotifyFormat";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { tryClaimNotificationDedupe } from "@/lib/notifications/notificationDedupe";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";
import { logPipelineEmailTelemetry } from "@/lib/notifications/notificationEmailTelemetry";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

const CANCEL_IDEM_REF_PREFIX = "cancelled:v1";

export type DispatchBookingCancelledNotificationsParams = {
  bookingId: string;
  /** Human-readable reason for admin email (e.g. customer request, ops action). */
  cancellationReason?: string | null;
};

type BookingCancelRow = {
  id: string;
  status: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  cleaner_id: string | null;
  is_team_job: boolean | null;
  cancelled_by: string | null;
  amount_paid_cents: number | null;
  paystack_reference: string | null;
};

function formatDateLabel(dateYmd: string | null): string {
  if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return "—";
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return dateYmd;
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
}

function formatTimeLabel(timeHm: string | null): string {
  const t = String(timeHm ?? "").trim();
  if (!t) return "—";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function cancellationReasonLabel(row: BookingCancelRow, override?: string | null): string | null {
  const custom = override?.trim();
  if (custom) return custom.slice(0, 500);
  const by = String(row.cancelled_by ?? "").trim().toLowerCase();
  if (by === "customer") return "Cancelled by customer";
  if (by === "cleaner") return "Cancelled by cleaner";
  if (by === "system") return "Cancelled by system";
  return null;
}

/** Skip notifications for abandoned checkout drafts with no confirmed customer contact. */
export function isDraftUnconfirmedCancellationBooking(row: Record<string, unknown>): boolean {
  const email = String(row.customer_email ?? "").trim();
  const phone = String(row.customer_phone ?? "").trim();
  const name = String(row.customer_name ?? "").trim();
  if (email || phone) return false;
  if (name) return false;
  const st = String(row.status ?? "").trim().toLowerCase();
  const paid = Number(row.amount_paid_cents ?? 0);
  return st === "pending_payment" && (!Number.isFinite(paid) || paid <= 0);
}

async function resolveAssignedCleanerIds(
  supabase: SupabaseClient,
  bookingId: string,
  primaryCleanerId: string | null,
  isTeamJob: boolean,
): Promise<string[]> {
  const ids = new Set<string>();
  if (primaryCleanerId) ids.add(primaryCleanerId);
  if (isTeamJob) {
    const { data: roster } = await supabase
      .from("booking_roster_member_payouts")
      .select("cleaner_id")
      .eq("booking_id", bookingId);
    for (const r of roster ?? []) {
      const cid = String((r as { cleaner_id?: string }).cleaner_id ?? "").trim();
      if (cid) ids.add(cid);
    }
  }
  return [...ids];
}

/**
 * Cancels unsent lifecycle + payment recovery jobs, then sends customer/admin/cleaner cancellation notifications.
 * Idempotent per booking via `cancelled_sent` dedupe claim.
 */
export async function dispatchBookingCancelledNotifications(
  supabase: SupabaseClient,
  params: DispatchBookingCancelledNotificationsParams,
): Promise<{ dispatched: boolean; skippedReason?: string }> {
  const bookingId = params.bookingId.trim();
  if (!bookingId) return { dispatched: false, skippedReason: "missing_booking_id" };

  const claimed = await tryClaimNotificationDedupe(supabase, "cancelled_sent", { bookingId });
  if (!claimed) return { dispatched: false, skippedReason: "already_sent" };

  await cancelUnsentBookingLifecycleJobs(supabase, bookingId, LIFECYCLE_SKIP.bookingCancelled);
  await cancelUnsentBookingPaymentRecoveryJobs(supabase, bookingId, PAYMENT_RECOVERY_SKIP.bookingCancelled);

  const { data: raw, error } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_email, customer_name, customer_phone, service, date, time, location, cleaner_id, is_team_job, cancelled_by, amount_paid_cents, paystack_reference",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !raw || typeof raw !== "object") {
    await reportOperationalIssue("warn", "bookingCancelledNotifications", error?.message ?? "booking not found", {
      bookingId,
    });
    return { dispatched: false, skippedReason: "booking_not_found" };
  }

  const row = raw as BookingCancelRow;
  if (String(row.status ?? "").trim().toLowerCase() !== "cancelled") {
    return { dispatched: false, skippedReason: "not_cancelled" };
  }

  if (isDraftUnconfirmedCancellationBooking(row as unknown as Record<string, unknown>)) {
    await logSystemEvent({
      level: "info",
      source: "bookingCancelledNotifications",
      message: "Skipped draft unconfirmed booking cancellation notifications",
      context: { bookingId },
    });
    return { dispatched: false, skippedReason: "draft_unconfirmed_booking" };
  }

  const serviceLabel = String(row.service ?? "").trim() || "Cleaning";
  const dateLabel = formatDateLabel(row.date);
  const timeLabel = formatTimeLabel(row.time);
  const location = String(row.location ?? "").trim() || "—";
  const reason = cancellationReasonLabel(row, params.cancellationReason);
  const idemRef = `${CANCEL_IDEM_REF_PREFIX}:${bookingId}`;

  let customerEmail = "";
  try {
    customerEmail = row.customer_email ? normalizeEmail(row.customer_email) : "";
  } catch {
    customerEmail = "";
  }

  if (customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    const claimedCustomer = await tryClaimNotificationIdempotency(supabase, {
      reference: idemRef,
      eventType: "customer_booking_cancelled",
      channel: "email",
      bookingId,
    });
    if (claimedCustomer) {
      const r = await sendCustomerBookingCancelledEmail({
        customerEmail,
        customerName: row.customer_name,
        serviceLabel,
        dateLabel,
        timeLabel,
        bookingId,
      });
      if (!r.sent && r.error) {
        await reportOperationalIssue("warn", "bookingCancelledNotifications/customer", r.error, { bookingId });
      }
      await logPipelineEmailTelemetry({
        role: "customer",
        channel: "customer_booking_cancelled",
        sent: r.sent,
        error: r.error,
        bookingId,
      });
    }
  }

  const claimedAdmin = await tryClaimNotificationIdempotency(supabase, {
    reference: idemRef,
    eventType: "admin_booking_cancelled",
    channel: "email",
    bookingId,
  });
  if (claimedAdmin) {
    try {
      await sendAdminBookingCancelledEmail({
        bookingId,
        customerName: row.customer_name,
        customerEmail: customerEmail || row.customer_email,
        customerPhone: row.customer_phone,
        serviceLabel,
        dateLabel,
        timeLabel,
        location,
        cancellationReason: reason,
        paystackReference: row.paystack_reference,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("error", "bookingCancelledNotifications/admin", msg, { bookingId });
    }
  }

  const cleanerIds = await resolveAssignedCleanerIds(
    supabase,
    bookingId,
    row.cleaner_id?.trim() || null,
    row.is_team_job === true,
  );

  if (cleanerIds.length > 0) {
    const msgFields = buildBookingNotifyMessageFields({
      bookingId,
      service: serviceLabel,
      date: row.date,
      time: row.time,
      location: row.location,
    });

    for (const cleanerId of cleanerIds) {
      const claimedCleaner = await tryClaimNotificationIdempotency(supabase, {
        reference: `${idemRef}:${cleanerId}`,
        eventType: "cleaner_booking_cancelled",
        channel: "email",
        bookingId,
      });
      if (!claimedCleaner) continue;

      const { data: cRow } = await supabase
        .from("cleaners")
        .select("full_name, email, phone_number")
        .eq("id", cleanerId)
        .maybeSingle();

      const cleanerName =
        cRow && typeof cRow === "object"
          ? String((cRow as { full_name?: string | null }).full_name ?? "").trim() || "Cleaner"
          : "Cleaner";
      const cleanerEmail =
        cRow && typeof cRow === "object" ? String((cRow as { email?: string | null }).email ?? "").trim() : "";
      const cleanerPhone =
        cRow && typeof cRow === "object"
          ? String((cRow as { phone_number?: string | null }).phone_number ?? "").trim()
          : "";

      let cleanerNotified = false;
      if (cleanerEmail) {
        const r = await sendCleanerBookingCancelledEmail({
          cleanerEmail,
          cleanerName,
          bookingId,
          service: serviceLabel,
          dateLabel,
          timeLabel,
          location,
        });
        cleanerNotified = r.sent;
        if (!r.sent && r.error) {
          await reportOperationalIssue("warn", "bookingCancelledNotifications/cleaner_email", r.error, {
            bookingId,
            cleanerId,
          });
        }
        await logPipelineEmailTelemetry({
          role: "cleaner",
          channel: "cleaner_booking_cancelled",
          sent: r.sent,
          error: r.error,
          bookingId,
        });
      }

      if (!cleanerNotified && cleanerPhone) {
        const smsClaimed = await tryClaimNotificationIdempotency(supabase, {
          reference: `${idemRef}:${cleanerId}`,
          eventType: "cleaner_booking_cancelled",
          channel: "sms",
          bookingId,
        });
        if (smsClaimed) {
          const e164 = customerPhoneToE164(cleanerPhone);
          if (e164) {
            const smsBody = formatBookingNotifyPlainLines(msgFields, {
              headline: "Shalean: Booking cancelled — do not attend",
            }).slice(0, 1200);
            await sendSmsFallback({
              toE164: e164,
              body: smsBody,
              context: { bookingId, cleanerId },
              smsRole: "primary",
              recipientKind: "cleaner",
              deliveryLog: {
                templateKey: "cleaner_booking_cancelled_sms",
                bookingId,
                eventType: "cleaner_booking_cancelled",
                role: "cleaner",
              },
            });
          }
        }
      }
    }
  }

  return { dispatched: true };
}
