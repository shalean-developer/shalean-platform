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
      status: string;
    }
  | {
      kind: "skipped";
      reason:
        | "no_zoho_config"
        | "monthly"
        | "sales_doc"
        | "no_customer"
        | "booking_not_found"
        | "load_failed";
    }
  | { kind: "failed"; error: string };

export type SyncPaidBookingSideEffectsResult = SyncPaidBookingInvoiceResult;

/**
 * Idempotent post-payment side effects for a paid booking:
 *   1. Sync invoice to Zoho Books (create + allocate + authoritative read) — or verify an
 *      existing Zoho invoice when `payment_method=zoho`.
 *   2. Provision a `recurring_bookings` plan for recurring bookings — idempotent.
 *
 * `kind: "synced"` is returned **only** when payment allocation succeeded (for create path)
 * and a subsequent authoritative Zoho invoice read confirms `status=paid` and `balanceCents===0`.
 * Unknown balances are never coerced to zero.
 *
 * Never throws — failures are logged and returned as `failed` / `skipped`.
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
  payment_reference_external?: string | null;
  booking_type?: string | null;
  recurring_frequency?: string | null;
  recurring_days?: string[] | null;
  recurring_start_date?: string | null;
  recurring_end_date?: string | null;
  selected_cleaner_id?: string | null;
};

function zohoConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID?.trim() && process.env.ZOHO_REFRESH_TOKEN?.trim());
}

/** Authoritative paid confirmation — never invent a zero balance. */
export function isAuthoritativeZohoInvoicePaid(details: {
  status: string;
  balanceCents: number;
}): boolean {
  return String(details.status ?? "").trim().toLowerCase() === "paid" && details.balanceCents === 0;
}

function resolveExternalZohoInvoiceId(row: PaidBookingRow): string {
  const linked = String(row.zoho_invoice_id ?? "").trim();
  if (linked) return linked;
  return String(row.payment_reference_external ?? "").trim();
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
    "payment_reference_external",
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

async function persistAuthoritativeInvoiceMetadata(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    zohoInvoiceId: string;
    zohoInvoiceNumber: string | null;
    details: {
      customerId: string | null;
      status: string;
      totalCents: number;
      taxCents: number;
      balanceCents: number;
    };
  },
): Promise<void> {
  await upsertInvoiceSyncMetadata(admin, {
    entityType: "booking",
    entityId: params.bookingId,
    zohoInvoiceId: params.zohoInvoiceId,
    zohoInvoiceNumber: params.zohoInvoiceNumber,
    bookingId: params.bookingId,
    zohoCustomerId: params.details.customerId,
    invoiceStatus: params.details.status,
    invoiceTotalCents: params.details.totalCents,
    taxAmountCents: params.details.taxCents,
    outstandingBalanceCents: params.details.balanceCents,
  });
}

/**
 * Retrieve Zoho invoice and confirm paid + zero balance. Never treats a failed read as paid.
 */
async function verifyZohoInvoicePaidZeroBalance(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    zohoInvoiceId: string;
    zohoInvoiceNumber?: string | null;
    linkOnBooking?: boolean;
  },
): Promise<SyncPaidBookingInvoiceResult> {
  const details = await getZohoInvoice(params.zohoInvoiceId);
  if (!details.ok) {
    await logSystemEvent({
      level: "warn",
      source: "booking/side_effects",
      message: "zoho_invoice_read_failed",
      context: { bookingId: params.bookingId, zohoInvoiceId: params.zohoInvoiceId, error: details.error },
    });
    return { kind: "failed", error: `zoho_invoice_read_failed:${details.error}` };
  }

  await persistAuthoritativeInvoiceMetadata(admin, {
    bookingId: params.bookingId,
    zohoInvoiceId: details.zohoInvoiceId,
    zohoInvoiceNumber: params.zohoInvoiceNumber ?? details.invoiceNumber,
    details: {
      customerId: details.customerId,
      status: details.status,
      totalCents: details.totalCents,
      taxCents: details.taxCents,
      balanceCents: details.balanceCents,
    },
  });

  if (params.linkOnBooking) {
    await admin
      .from("bookings")
      .update({
        zoho_invoice_id: details.zohoInvoiceId,
        zoho_invoice_number: details.invoiceNumber,
      })
      .eq("id", params.bookingId);
  }

  if (!isAuthoritativeZohoInvoicePaid(details)) {
    await logSystemEvent({
      level: "warn",
      source: "booking/side_effects",
      message: "zoho_invoice_not_fully_paid",
      context: {
        bookingId: params.bookingId,
        zohoInvoiceId: details.zohoInvoiceId,
        status: details.status,
        balanceCents: details.balanceCents,
      },
    });
    return {
      kind: "failed",
      error: `zoho_invoice_not_paid_zero_balance:status=${details.status}:balanceCents=${details.balanceCents}`,
    };
  }

  return {
    kind: "synced",
    zohoInvoiceId: details.zohoInvoiceId,
    zohoInvoiceNumber: details.invoiceNumber,
    balanceCents: details.balanceCents,
    status: details.status,
  };
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
  const paymentMethod = String(row.payment_method ?? "").toLowerCase();

  let invoiceResult: SyncPaidBookingInvoiceResult;

  // ── 1. Zoho Books invoice sync / verification ────────────────────────────────
  if (row.is_monthly_billing_booking === true) {
    invoiceResult = { kind: "skipped", reason: "monthly" };
  } else if (String(row.sales_document_id ?? "").trim()) {
    invoiceResult = { kind: "skipped", reason: "sales_doc" };
  } else if (!zohoConfigured()) {
    // Off-platform Zoho settlements still require live verification when method=zoho.
    if (paymentMethod === "zoho") {
      invoiceResult = {
        kind: "failed",
        error: "zoho_not_configured_cannot_verify_payment_method_zoho",
      };
    } else {
      invoiceResult = { kind: "skipped", reason: "no_zoho_config" };
    }
  } else if (paymentMethod === "zoho") {
    const zohoInvoiceId = resolveExternalZohoInvoiceId(row);
    if (!zohoInvoiceId) {
      invoiceResult = { kind: "failed", error: "missing_zoho_invoice_identifier" };
    } else {
      invoiceResult = await verifyZohoInvoicePaidZeroBalance(admin, {
        bookingId,
        zohoInvoiceId,
        linkOnBooking: !String(row.zoho_invoice_id ?? "").trim(),
      });
    }
  } else if (String(row.zoho_invoice_id ?? "").trim()) {
    // Already linked: re-read authoritatively; never invent paid/zero.
    invoiceResult = await verifyZohoInvoicePaidZeroBalance(admin, {
      bookingId,
      zohoInvoiceId: String(row.zoho_invoice_id).trim(),
    });
  } else if (!bookingCustomerKey(row) && !String(row.customer_email ?? "").trim()) {
    invoiceResult = { kind: "skipped", reason: "no_customer" };
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
          description:
            item.description ??
            ([row.date, locationLabel].filter(Boolean).join(" · ") || `Booking ref: ${reference}`),
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

        if (!zohoInvoiceRes.ok) {
          await logSystemEvent({
            level: "warn",
            source: "booking/side_effects",
            message: "zoho_invoice_create_failed",
            context: { bookingId, error: zohoInvoiceRes.error },
          });
          invoiceResult = { kind: "failed", error: zohoInvoiceRes.error };
        } else {
          await admin
            .from("bookings")
            .update({
              zoho_invoice_id: zohoInvoiceRes.zohoInvoiceId,
              zoho_invoice_number: zohoInvoiceRes.invoiceNumber,
            })
            .eq("id", bookingId);

          const payRes = await markZohoInvoicePaid({
            zohoInvoiceId: zohoInvoiceRes.zohoInvoiceId,
            amountZar: totalZar,
            paymentDate: today,
            reference,
            customerEmail: contact.email,
            customerName: contact.name,
          });

          if (!payRes.ok) {
            await logSystemEvent({
              level: "warn",
              source: "booking/side_effects",
              message: "zoho_payment_allocation_failed",
              context: { bookingId, zohoInvoiceId: zohoInvoiceRes.zohoInvoiceId, error: payRes.error },
            });
            invoiceResult = {
              kind: "failed",
              error: `zoho_payment_allocation_failed:${payRes.error}`,
            };
          } else {
            // Allocation succeeded — still require an authoritative read of paid + zero balance.
            invoiceResult = await verifyZohoInvoicePaidZeroBalance(admin, {
              bookingId,
              zohoInvoiceId: zohoInvoiceRes.zohoInvoiceId,
              zohoInvoiceNumber: zohoInvoiceRes.invoiceNumber,
            });
          }
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
