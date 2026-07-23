import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseBookingServiceId, type BookingServiceId } from "@/components/booking/serviceCategories";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { getDefaultFromAddress } from "@/lib/email/resendFrom";
import { safeResendSend } from "@/lib/email/safeResendSend";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  notifyBookingEvent,
  type NotifyBookingEventDeliveryResult,
} from "@/lib/notifications/notifyBookingEvent";
import {
  releaseNotificationIdempotencyClaim,
  tryClaimNotificationIdempotency,
} from "@/lib/notifications/notificationIdempotencyClaim";
import { getZohoInvoicePdf } from "@/lib/zoho/zohoBooksService";

export type PaymentAlreadyReceivedReceiptDeliveryResult = NotifyBookingEventDeliveryResult & {
  /** True only when the customer email included a paid invoice PDF (authoritative attach). */
  paidInvoiceIncluded: boolean;
};

function asSnapshot(raw: unknown): BookingSnapshotV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.v === "number") return raw as BookingSnapshotV1;
  return null;
}

function serviceMeta(service: BookingServiceId): Record<string, unknown> {
  if (service === "deep") {
    return {
      service: "deep",
      service_group: "specialised",
      selectedCategory: "specialised",
      service_type: "deep_cleaning",
    };
  }
  if (service === "move") {
    return {
      service: "move",
      service_group: "specialised",
      selectedCategory: "specialised",
      service_type: "move_cleaning",
    };
  }
  if (service === "airbnb") {
    return {
      service: "airbnb",
      service_group: "regular",
      selectedCategory: "regular",
      service_type: "airbnb_cleaning",
    };
  }
  if (service === "carpet") {
    return {
      service: "carpet",
      service_group: "specialised",
      selectedCategory: "specialised",
      service_type: "carpet_cleaning",
    };
  }
  return {
    service: "standard",
    service_group: "regular",
    selectedCategory: "regular",
    service_type: "standard_cleaning",
  };
}

/**
 * Build a Paystack-compatible booking snapshot from the persisted booking row so
 * `notifyBookingEvent(payment_confirmed)` has the required snapshot fields.
 */
export function buildPaymentConfirmedSnapshotFromBookingRow(
  row: Record<string, unknown>,
  fallbackEmail: string,
): BookingSnapshotV1 {
  const existing = asSnapshot(row.booking_snapshot);
  const email =
    normalizeEmail(existing?.customer?.email ?? "") ||
    normalizeEmail(fallbackEmail) ||
    normalizeEmail(String(row.customer_email ?? "")) ||
    fallbackEmail;

  if (existing?.locked || existing?.customer) {
    return {
      ...existing,
      v: existing.v ?? 1,
      customer: {
        name: existing.customer?.name || String(row.customer_name ?? "").trim() || "Customer",
        email,
        phone: existing.customer?.phone || String(row.customer_phone ?? "").trim() || "",
        user_id: existing.customer?.user_id ?? (typeof row.user_id === "string" ? row.user_id : null),
        type: existing.customer?.type ?? "login",
      },
    };
  }

  const serviceRaw = String(row.service_slug ?? row.service ?? "standard").trim().toLowerCase();
  const serviceId = parseBookingServiceId(serviceRaw) ?? "standard";
  const rooms = Number(row.rooms);
  const bathrooms = Number(row.bathrooms);
  const totalZar = Number(row.total_paid_zar ?? row.total_price ?? 0);
  const lockedAt = new Date().toISOString();
  const lockPayload = {
    ...serviceMeta(serviceId),
    locked: true,
    lockedAt,
    date: String(row.date ?? "").trim() || lockedAt.slice(0, 10),
    time: String(row.time ?? "").trim() || "09:00",
    finalPrice: Math.max(1, Math.round(Number.isFinite(totalZar) ? totalZar : 1)),
    finalHours: 3,
    surge: 1,
    rooms: Number.isFinite(rooms) && rooms > 0 ? Math.round(rooms) : 1,
    bathrooms: Number.isFinite(bathrooms) && bathrooms > 0 ? Math.round(bathrooms) : 1,
    extraRooms: 0,
    extras: [] as string[],
    location: String(row.location ?? "").trim().slice(0, 500) || "—",
    propertyType: "apartment" as const,
    cleaningFrequency: "one_time" as const,
  };
  const locked = parseLockedBookingFromUnknown(lockPayload);

  return {
    v: 1,
    ...(locked ? { locked } : {}),
    flat: {
      service: serviceRaw,
      rooms: Number.isFinite(rooms) && rooms > 0 ? Math.round(rooms) : 1,
      bathrooms: Number.isFinite(bathrooms) && bathrooms > 0 ? Math.round(bathrooms) : 1,
      extras: [],
      location: String(row.location ?? "") || null,
      date: String(row.date ?? "") || null,
      time: String(row.time ?? "") || null,
    },
    total_zar: Number.isFinite(totalZar) ? totalZar : 0,
    customer: {
      name: String(row.customer_name ?? "").trim() || "Customer",
      email,
      phone: String(row.customer_phone ?? "").trim() || "0000000000",
      user_id: typeof row.user_id === "string" ? row.user_id : null,
      type: "login",
    },
  };
}

async function tryLoadPaidInvoicePdfAttachment(zohoInvoiceId: string | null | undefined): Promise<{
  filename: string;
  content: Buffer;
} | null> {
  const id = String(zohoInvoiceId ?? "").trim();
  if (!id) return null;
  const res = await getZohoInvoicePdf(id);
  if (!res.ok) return null;
  return {
    filename: `shalean-paid-invoice-${id.slice(0, 12)}.pdf`,
    content: Buffer.from(res.pdf),
  };
}

/**
 * Deliver the customer payment confirmation for admin "payment already received".
 *
 * - Supplies a booking snapshot to {@link notifyBookingEvent}
 * - When a verified Zoho invoice id is available, also attempts a paid-invoice PDF email.
 *   `paidInvoiceIncluded` is true only when that PDF was accepted by the email provider.
 * - `customerEmailSent` is true only when the confirmation provider confirms acceptance.
 */
export async function deliverPaymentAlreadyReceivedReceipt(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    customerEmail: string;
    amountCents: number;
    paymentReference: string;
    zohoInvoiceId?: string | null;
  },
): Promise<PaymentAlreadyReceivedReceiptDeliveryResult> {
  const { bookingId, amountCents, paymentReference } = params;
  const customerEmail = normalizeEmail(params.customerEmail);

  const { data: rowRaw, error } = await admin
    .from("bookings")
    .select(
      "user_id, customer_email, customer_name, customer_phone, service, service_slug, date, time, location, suburb, rooms, bathrooms, total_paid_zar, total_price, booking_snapshot, booking_reference, zoho_invoice_id, zoho_invoice_number",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !rowRaw) {
    return {
      customerEmailSent: false,
      dedupeSkipped: false,
      failed: true,
      error: error?.message ?? "booking_not_found",
      paidInvoiceIncluded: false,
    };
  }

  const row = rowRaw as Record<string, unknown>;
  const snapshot = buildPaymentConfirmedSnapshotFromBookingRow(row, customerEmail);
  const zohoInvoiceId =
    String(params.zohoInvoiceId ?? "").trim() || String(row.zoho_invoice_id ?? "").trim() || null;

  const notifyResult = await notifyBookingEvent({
    type: "payment_confirmed",
    supabase: admin,
    bookingId,
    snapshot,
    customerEmail,
    amountCents,
    paymentReference,
  });

  let paidInvoiceIncluded = false;

  // Only claim "paid invoice emailed" when we successfully attach an authoritative paid PDF.
  if (notifyResult.customerEmailSent && zohoInvoiceId) {
    const pdf = await tryLoadPaidInvoicePdfAttachment(zohoInvoiceId);
    if (pdf) {
      const claimed = await tryClaimNotificationIdempotency(admin, {
        reference: paymentReference,
        eventType: "payment_confirmed_paid_invoice_pdf",
        channel: "email",
        bookingId,
      });
      if (claimed) {
        const from = getDefaultFromAddress();
        const invoiceNumber = String(row.zoho_invoice_number ?? "").trim() || zohoInvoiceId;
        const { error: sendErr } = await safeResendSend({
          from,
          to: customerEmail,
          subject: `Your paid Shalean invoice (${invoiceNumber})`,
          html: `<p>Hi,</p><p>Your payment has been recorded. Your paid invoice PDF is attached.</p><p>Invoice: <strong>${invoiceNumber}</strong></p>`,
          attachments: [
            {
              filename: pdf.filename,
              content: pdf.content,
            },
          ],
        });
        if (sendErr) {
          await releaseNotificationIdempotencyClaim(admin, {
            reference: paymentReference,
            eventType: "payment_confirmed_paid_invoice_pdf",
            channel: "email",
            bookingId,
          });
          await reportOperationalIssue(
            "warn",
            "admin/payment_already_received",
            `paid_invoice_pdf_email_failed: ${sendErr.message}`,
            { bookingId, zohoInvoiceId },
          );
        } else {
          paidInvoiceIncluded = true;
          void logSystemEvent({
            level: "info",
            source: "admin/payment_already_received",
            message: "paid_invoice_pdf_emailed",
            context: { bookingId, zohoInvoiceId },
          });
        }
      }
    } else {
      await reportOperationalIssue(
        "warn",
        "admin/payment_already_received",
        "paid_invoice_pdf_unavailable",
        { bookingId, zohoInvoiceId },
      );
    }
  }

  return {
    ...notifyResult,
    paidInvoiceIncluded,
  };
}
