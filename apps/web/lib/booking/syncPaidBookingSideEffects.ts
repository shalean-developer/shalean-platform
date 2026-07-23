import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { bookingCustomerKey } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { createZohoInvoice, getZohoInvoice, markZohoInvoicePaid, todayYmdJhb } from "@/lib/zoho/zohoBooksService";
import { upsertInvoiceSyncMetadata } from "@/lib/accounting/syncInvoiceMetadata";
import { buildZohoLineItemsWithReferralPromos } from "@/lib/referrals/zohoLineItems";
import { resolveZohoCustomerContactForBooking } from "@/lib/zoho/resolveZohoCustomerContact";
import { provisionV2RecurringPlan } from "@/lib/recurring/provisionV2RecurringPlan";
import { preferredCleanerIdsFromSnapshot } from "@/lib/booking/persistPreferredCleaners";

export type SyncPaidBookingInvoiceResult =
  | {
      kind: "synced";
      zohoInvoiceId: string;
      zohoInvoiceNumber: string | null;
      balanceCents: number;
      status: string | null;
    }
  | {
      kind: "skipped";
      reason:
        | "no_zoho_config"
        | "monthly"
        | "sales_doc"
        | "payment_method_zoho"
        | "no_customer"
        | "already_linked"
        | "booking_not_found"
        | "load_failed";
      zohoInvoiceId?: string;
      balanceCents?: number;
      status?: string | null;
    }
  | { kind: "failed"; error: string };

export type SyncPaidBookingSideEffectsResult = SyncPaidBookingInvoiceResult;

/**
 * Idempotent post-payment side effects for a paid booking:
 *   1. Sync invoice to Zoho Books (create + mark paid) — skipped if `zoho_invoice_id` already set.
 *   2. Provision a `recurring_bookings` plan for recurring bookings — `provisionV2RecurringPlan` is itself idempotent.
 *
 * Called from the Paystack verify pipeline, Paystack webhook, and admin mark-paid.
 * Safe to call multiple times for the same booking.
 *
 * Never throws — all failures are logged to `system_logs` so they cannot interrupt payment
 * confirmation. Returns a structured invoice result for callers that must gate receipt email
 * on create/allocate/zero-balance confirmation.
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

function skipReasonForZohoInvoice(row: PaidBookingRow): SyncPaidBookingInvoiceResult | null {
  if (row.is_monthly_billing_booking === true) {
    return { kind: "skipped", reason: "monthly" };
  }
  const existingZoho = String(row.zoho_invoice_id ?? "").trim();
  if (existingZoho) {
    return { kind: "skipped", reason: "already_linked", zohoInvoiceId: existingZoho };
  }
  if (String(row.sales_document_id ?? "").trim()) {
    return { kind: "skipped", reason: "sales_doc" };
  }
  if (String(row.payment_method ?? "").toLowerCase() === "zoho") {
    return { kind: "skipped", reason: "payment_method_zoho" };
  }
  if (!bookingCustomerKey(row) && !String(row.customer_email ?? "").trim()) {
    return { kind: "skipped", reason: "no_customer" };
  }
  return null;
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
): Promise<SyncPaidBookingSideEffectsResult> {
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
    return { kind: "skipped", reason: "load_failed" };
  }

  if (!row) return { kind: "skipped", reason: "booking_not_found" };

  const totalZar = row.total_paid_zar ?? amountCents / 100;
  const customerId = bookingCustomerKey(row);

  let invoiceResult: SyncPaidBookingInvoiceResult;

  // ── 1. Zoho Books invoice sync (idempotent: skip if already synced) ──────────
  const zohoReady = Boolean(process.env.ZOHO_CLIENT_ID?.trim() && process.env.ZOHO_REFRESH_TOKEN?.trim());
  const skip = skipReasonForZohoInvoice(row);

  if (!zohoReady) {
    invoiceResult = { kind: "skipped", reason: "no_zoho_config" };
  } else if (skip) {
    if (skip.reason === "already_linked" && skip.zohoInvoiceId) {
      const details = await getZohoInvoice(skip.zohoInvoiceId);
      if (details.ok) {
        await upsertInvoiceSyncMetadata(admin, {
          entityType: "booking",
          entityId: bookingId,
          zohoInvoiceId: details.zohoInvoiceId,
          zohoInvoiceNumber: details.invoiceNumber,
          bookingId,
          zohoCustomerId: details.customerId,
          invoiceStatus: details.status,
          invoiceTotalCents: details.totalCents,
          taxAmountCents: details.taxCents,
          outstandingBalanceCents: details.balanceCents,
        });
        invoiceResult = {
          kind: "skipped",
          reason: "already_linked",
          zohoInvoiceId: details.zohoInvoiceId,
          balanceCents: details.balanceCents,
          status: details.status,
        };
      } else {
        invoiceResult = skip;
      }
    } else {
      invoiceResult = skip;
    }
  } else {
    try {
      const contactRes = await resolveZohoCustomerContactForBooking(admin, row);
      if (!contactRes.ok) {
        await logSystemEvent({
          level: "warn",
          source: "booking/side_effects",
          message: "zoho_invoice_create_failed",
          context: { bookingId, error: contactRes.error },
        });
        invoiceResult = { kind: "failed", error: contactRes.error };
      } else {
        const contact = contactRes.contact;
        const today = todayYmdJhb();
        const locationLabel = [row.location, row.suburb].filter(Boolean).join(", ");
        const lineItems = buildZohoLineItemsWithReferralPromos({
          service: row.service,
          totalPaidZar: totalZar,
          bookingSnapshot: row.booking_snapshot,
        }).map((item) => ({
          ...item,
          description: item.description ?? ([row.date, locationLabel].filter(Boolean).join(" · ") || `Booking ref: ${reference}`),
        }));
        const zohoInvoiceRes = await createZohoInvoice({
          referenceId: bookingId,
          orderKind: "booking",
          customerEmail: contact.email,
          customerName: contact.name,
          customerPhone: contact.phone,
          invoiceDate: today,
          dueDate: today,
          lineItems,
          notes: `Paystack ref: ${reference}`,
          currencyCode: "ZAR",
        });

        if (zohoInvoiceRes.ok) {
          const payRes = await markZohoInvoicePaid({
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
          const balanceCents = details.ok ? details.balanceCents : payRes.ok ? 0 : -1;
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

          if (!payRes.ok && details.ok && details.balanceCents > 0) {
            invoiceResult = {
              kind: "failed",
              error: payRes.error || "zoho_mark_paid_failed",
            };
          } else {
            invoiceResult = {
              kind: "synced",
              zohoInvoiceId: zohoInvoiceRes.zohoInvoiceId,
              zohoInvoiceNumber: zohoInvoiceRes.invoiceNumber,
              balanceCents: balanceCents < 0 ? 0 : balanceCents,
              status: details.ok ? details.status : "paid",
            };
          }
        } else {
          await logSystemEvent({
            level: "warn",
            source: "booking/side_effects",
            message: "zoho_invoice_create_failed",
            context: { bookingId, error: zohoInvoiceRes.error },
          });
          invoiceResult = { kind: "failed", error: zohoInvoiceRes.error };
        }
      }
    } catch (err) {
      await logSystemEvent({
        level: "warn",
        source: "booking/side_effects",
        message: "zoho_sync_exception",
        context: { bookingId, error: String(err) },
      });
      invoiceResult = { kind: "failed", error: String(err) };
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

  return invoiceResult;
}
