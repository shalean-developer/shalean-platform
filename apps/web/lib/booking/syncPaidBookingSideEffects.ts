import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { bookingCustomerKey } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { createZohoInvoice, getZohoInvoice, markZohoInvoicePaid, todayYmdJhb } from "@/lib/zoho/zohoBooksService";
import { upsertInvoiceSyncMetadata } from "@/lib/accounting/syncInvoiceMetadata";
import { resolveZohoCustomerContactForBooking } from "@/lib/zoho/resolveZohoCustomerContact";
import { provisionV2RecurringPlan } from "@/lib/recurring/provisionV2RecurringPlan";
import { preferredCleanerIdsFromSnapshot } from "@/lib/booking/persistPreferredCleaners";

/**
 * Idempotent post-payment side effects for a paid booking:
 *   1. Sync invoice to Zoho Books (create + mark paid) — skipped if `zoho_invoice_id` already set.
 *   2. Provision a `recurring_bookings` plan for recurring bookings — `provisionV2RecurringPlan` is itself idempotent.
 *
 * Called from the Paystack verify pipeline, Paystack webhook, and admin mark-paid.
 * Safe to call multiple times for the same booking.
 *
 * Never throws — all failures are logged to `system_logs` so they cannot interrupt payment
 * confirmation.
 */
type PaidBookingRow = {
  customer_id?: string | null;
  user_id?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  booking_snapshot?: unknown;
  service?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  suburb?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  total_paid_zar?: number | null;
  duration_minutes?: number | null;
  zoho_invoice_id?: string | null;
  is_monthly_billing_booking?: boolean | null;
  sales_document_id?: string | null;
  payment_method?: string | null;
  booking_type?: string | null;
  recurring_frequency?: string | null;
  recurring_days?: string[] | null;
  recurring_start_date?: string | null;
  recurring_end_date?: string | null;
  selected_cleaner_id?: string | null;
};

function shouldCreateBookingZohoInvoice(row: PaidBookingRow): boolean {
  if (row.is_monthly_billing_booking === true) return false;
  if (String(row.zoho_invoice_id ?? "").trim()) return false;
  if (String(row.sales_document_id ?? "").trim()) return false;
  if (String(row.payment_method ?? "").toLowerCase() === "zoho") return false;
  return Boolean(bookingCustomerKey(row) || String(row.customer_email ?? "").trim());
}

async function loadPaidBookingRow(
  admin: SupabaseClient,
  bookingId: string,
): Promise<PaidBookingRow | null> {
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const select = [
    ownershipColumn,
    "customer_email",
    "customer_name",
    "customer_phone",
    "booking_snapshot",
    "service",
    "date",
    "time",
    "location",
    "suburb",
    "rooms",
    "bathrooms",
    "total_paid_zar",
    "duration_minutes",
    "zoho_invoice_id",
    "is_monthly_billing_booking",
    "sales_document_id",
    "payment_method",
    "booking_type",
    "recurring_frequency",
    "recurring_days",
    "recurring_start_date",
    "recurring_end_date",
    "selected_cleaner_id",
  ].join(", ");

  const { data } = await admin.from("bookings").select(select).eq("id", bookingId).maybeSingle();
  return (data as PaidBookingRow | null) ?? null;
}

export async function syncPaidBookingSideEffects(
  admin: SupabaseClient,
  params: { bookingId: string; reference: string; amountCents: number },
): Promise<void> {
  const { bookingId, reference, amountCents } = params;

  let row: PaidBookingRow | null = null;

  try {
    row = await loadPaidBookingRow(admin, bookingId);
  } catch (err) {
    await logSystemEvent({
      level: "warn",
      source: "booking/side_effects",
      message: "side_effects_load_failed",
      context: { bookingId, error: String(err) },
    });
    return;
  }

  if (!row) return;

  const totalZar = row.total_paid_zar ?? amountCents / 100;
  const customerId = bookingCustomerKey(row);

  // ── 1. Zoho Books invoice sync (idempotent: skip if already synced) ──────────
  if (
    process.env.ZOHO_CLIENT_ID &&
    process.env.ZOHO_REFRESH_TOKEN &&
    shouldCreateBookingZohoInvoice(row)
  ) {
    try {
      const contactRes = await resolveZohoCustomerContactForBooking(admin, row);
      if (!contactRes.ok) {
        await logSystemEvent({
          level: "warn",
          source: "booking/side_effects",
          message: "zoho_invoice_create_failed",
          context: { bookingId, error: contactRes.error },
        });
      } else {
        const contact = contactRes.contact;
        const today = todayYmdJhb();
        const locationLabel = [row.location, row.suburb].filter(Boolean).join(", ");
        const zohoInvoiceRes = await createZohoInvoice({
          referenceId: bookingId,
          orderKind: "booking",
          customerEmail: contact.email,
          customerName: contact.name,
          customerPhone: contact.phone,
          invoiceDate: today,
          dueDate: today,
          lineItems: [
            {
              name: row.service ?? "Shalean Cleaning Service",
              description: [row.date, locationLabel].filter(Boolean).join(" · ") || `Booking ref: ${reference}`,
              rate: totalZar,
              quantity: 1,
            },
          ],
          notes: `Paystack ref: ${reference}`,
          currencyCode: "ZAR",
        });

        if (zohoInvoiceRes.ok) {
          await markZohoInvoicePaid({
            zohoInvoiceId: zohoInvoiceRes.zohoInvoiceId,
            amountZar: totalZar,
            paymentDate: today,
            reference,
            customerEmail: contact.email,
            customerName: contact.name,
          });
          await admin
            .from("bookings")
            .update({
              zoho_invoice_id: zohoInvoiceRes.zohoInvoiceId,
              zoho_invoice_number: zohoInvoiceRes.invoiceNumber,
            })
            .eq("id", bookingId);

          const details = await getZohoInvoice(zohoInvoiceRes.zohoInvoiceId);
          await upsertInvoiceSyncMetadata(admin, {
            entityType: "booking",
            entityId: bookingId,
            zohoInvoiceId: zohoInvoiceRes.zohoInvoiceId,
            zohoInvoiceNumber: zohoInvoiceRes.invoiceNumber,
            bookingId,
            zohoCustomerId: details.ok ? details.customerId : null,
            invoiceStatus: details.ok ? details.status : "paid",
            invoiceTotalCents: details.ok ? details.totalCents : Math.round(totalZar * 100),
            taxAmountCents: details.ok ? details.taxCents : null,
            outstandingBalanceCents: details.ok ? details.balanceCents : 0,
          });
        } else {
          await logSystemEvent({
            level: "warn",
            source: "booking/side_effects",
            message: "zoho_invoice_create_failed",
            context: { bookingId, error: zohoInvoiceRes.error },
          });
        }
      }
    } catch (err) {
      await logSystemEvent({
        level: "warn",
        source: "booking/side_effects",
        message: "zoho_sync_exception",
        context: { bookingId, error: String(err) },
      });
    }
  }

  // ── 2. Recurring plan provisioning (idempotent inside provisionV2RecurringPlan) ──
  const isRecurring =
    (row.booking_type === "recurring" || Boolean(row.recurring_frequency)) &&
    row.recurring_frequency &&
    row.recurring_frequency !== "" &&
    customerId;

  if (isRecurring) {
    try {
      const planResult = await provisionV2RecurringPlan(admin, {
        bookingId,
        customerId: customerId!,
        recurringFrequency: row.recurring_frequency!,
        recurringDays: Array.isArray(row.recurring_days) ? row.recurring_days : [],
        startDate: row.recurring_start_date || row.date || new Date().toISOString().slice(0, 10),
        endDate: row.recurring_end_date ?? null,
        totalPaidZar: totalZar,
        durationMinutes: row.duration_minutes ?? 120,
        service: row.service ?? "regular-cleaning",
        time: row.time ?? "09:00",
        location: row.location ?? "",
        suburb: row.suburb ?? "",
        rooms: row.rooms ?? 0,
        bathrooms: row.bathrooms ?? 0,
        preferredCleanerIds: preferredCleanerIdsFromSnapshot(row.booking_snapshot, row.selected_cleaner_id),
      });

      if (!planResult.ok) {
        await logSystemEvent({
          level: "warn",
          source: "booking/side_effects",
          message: "recurring_plan_provision_failed",
          context: { bookingId, error: planResult.error },
        });
      }
    } catch (err) {
      await logSystemEvent({
        level: "warn",
        source: "booking/side_effects",
        message: "recurring_plan_provision_exception",
        context: { bookingId, error: String(err) },
      });
    }
  }
}
