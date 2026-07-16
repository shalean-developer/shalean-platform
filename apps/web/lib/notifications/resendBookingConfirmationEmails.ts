import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import {
  buildBookingEmailPayload,
  sendAdminHtmlEmail,
  sendBookingConfirmationEmail,
} from "@/lib/email/sendBookingEmail";
import { buildBookingNotifyFieldsFromRow, formatAdminDateTimeLine } from "@/lib/notifications/bookingNotifyFormat";
import { bookingEmailRowOverlayFromRecord } from "@/lib/email/resolveBookingEmailFields";

export type ResendBookingConfirmationEmailsResult = {
  customer: { attempted: boolean; sent: boolean; error?: string };
  admin: { attempted: boolean; sent: boolean; error?: string };
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function adminBaseBlock(b: {
  bookingId: string;
  service: string;
  date: string;
  time: string;
  location: string;
  customerEmail?: string;
  paystackRef?: string;
}): string {
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">
  <p><strong>Booking ID:</strong> <code>${escapeHtml(b.bookingId)}</code></p>
  <p><strong>Service:</strong> ${escapeHtml(b.service)}</p>
  <p><strong>Date / time:</strong> ${escapeHtml(formatAdminDateTimeLine(b.date, b.time))}</p>
  <p><strong>Address:</strong> ${escapeHtml(b.location || "—")}</p>
  ${b.customerEmail ? `<p><strong>Customer:</strong> ${escapeHtml(b.customerEmail)}</p>` : ""}
  ${b.paystackRef ? `<p><strong>Payment ref:</strong> <code>${escapeHtml(b.paystackRef)}</code></p>` : ""}
</div>`;
}

/**
 * Admin-only: re-send payment-confirmed customer + admin emails without idempotency claims.
 * Used when initial delivery failed but claims blocked automatic retries.
 */
export async function resendBookingConfirmationEmails(
  supabase: SupabaseClient,
  bookingId: string,
  options?: { includeCustomer?: boolean; includeAdmin?: boolean },
): Promise<ResendBookingConfirmationEmailsResult> {
  const includeCustomer = options?.includeCustomer !== false;
  const includeAdmin = options?.includeAdmin !== false;

  const result: ResendBookingConfirmationEmailsResult = {
    customer: { attempted: false, sent: false },
    admin: { attempted: false, sent: false },
  };

  const { data: row, error } = await supabase
    .from("bookings")
    .select(
      "id, customer_email, paystack_reference, amount_paid_cents, booking_snapshot, assignment_type, fallback_reason, selected_cleaner_id, cleaner_id, date, time, location, suburb, service, service_slug, booking_reference, extras, selected_extras, booking_type, recurring_frequency, recurring_days",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row || typeof row !== "object") throw new Error("Booking not found.");

  const head = row as Record<string, unknown>;
  const paymentReference = String(head.paystack_reference ?? "").trim() || bookingId;
  const amountPaidCentsRaw = head.amount_paid_cents;
  const amountCents =
    typeof amountPaidCentsRaw === "number" && Number.isFinite(amountPaidCentsRaw)
      ? Math.round(amountPaidCentsRaw)
      : 0;

  const snapshotRaw = head.booking_snapshot;
  const snapshot: BookingSnapshotV1 | null =
    snapshotRaw && typeof snapshotRaw === "object" && !Array.isArray(snapshotRaw)
      ? (snapshotRaw as BookingSnapshotV1)
      : null;

  const emailCandidates = [
    String(head.customer_email ?? ""),
    snapshot?.customer?.email ?? "",
  ];
  let resolvedEmail = "";
  for (const raw of emailCandidates) {
    const n = normalizeEmail(raw);
    if (n && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) {
      resolvedEmail = n;
      break;
    }
  }

  let assignedCleanerName: string | null = null;
  const selectedCleanerId = String(head.selected_cleaner_id ?? "").trim();
  const assignedCleanerId = String(head.cleaner_id ?? "").trim();
  const cleanerLookupId = assignedCleanerId || selectedCleanerId;
  if (cleanerLookupId) {
    const { data: cleanerRow } = await supabase
      .from("cleaners")
      .select("full_name")
      .eq("id", cleanerLookupId)
      .maybeSingle();
    const name =
      cleanerRow && typeof cleanerRow === "object"
        ? String((cleanerRow as { full_name?: string | null }).full_name ?? "").trim()
        : "";
    assignedCleanerName = name || null;
  }

  const payload = buildBookingEmailPayload({
    paymentReference,
    amountCents,
    customerEmail: resolvedEmail,
    snapshot,
    bookingId,
    bookingReference: String(head.booking_reference ?? "").trim() || null,
    assignmentType: String(head.assignment_type ?? "").trim() || null,
    fallbackReason: String(head.fallback_reason ?? "").trim() || null,
    bookingRow: bookingEmailRowOverlayFromRecord(head),
    persistedSnapshot: head.booking_snapshot,
    assignedCleanerName,
  });

  if (includeCustomer) {
    result.customer.attempted = true;
    if (!resolvedEmail) {
      result.customer.error = "No valid customer email on booking.";
    } else {
      try {
        const cust = await sendBookingConfirmationEmail(payload);
        result.customer.sent = cust.sent;
        result.customer.error = cust.error;
      } catch (e) {
        result.customer.error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  if (includeAdmin) {
    result.admin.attempted = true;
    if (!process.env.ADMIN_NOTIFICATION_EMAIL?.trim()) {
      result.admin.error = "ADMIN_NOTIFICATION_EMAIL not configured.";
    } else {
      const payFields = buildBookingNotifyFieldsFromRow(bookingId, head);
      const adminAssignmentNote =
        payload.showCleanerSubstitutionNotice && payload.fallbackReason
          ? `<p style="font-family:system-ui,sans-serif;font-size:14px;color:#92400e"><strong>Checkout assignment:</strong> auto_fallback — ${escapeHtml(payload.fallbackReason)}</p>`
          : payload.showCleanerSubstitutionNotice
            ? `<p style="font-family:system-ui,sans-serif;font-size:14px;color:#92400e"><strong>Checkout assignment:</strong> auto_fallback</p>`
            : "";
      const adminHtml = `<h2 style="font-family:system-ui">Payment confirmed</h2>${adminAssignmentNote}${adminBaseBlock({
        bookingId: payFields.id,
        service: payFields.service,
        date: payFields.date,
        time: payFields.time,
        location: payFields.address,
        customerEmail: payload.customerEmail,
        paystackRef: paymentReference,
      })}`;
      const adminResult = await sendAdminHtmlEmail({
        subject: `[PAYMENT_CONFIRMED] ${payload.serviceLabel} — ${bookingId.slice(0, 8)}… (resend)`,
        html: adminHtml,
        context: { bookingId, type: "payment_confirmed", admin_resend: true },
      });
      result.admin.sent = adminResult.sent;
      result.admin.error = adminResult.error;
    }
  }

  return result;
}
