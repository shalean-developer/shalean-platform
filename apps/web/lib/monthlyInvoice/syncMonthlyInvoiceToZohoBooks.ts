import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createZohoInvoice,
  updateZohoInvoice,
  zohoInvoiceExists,
} from "@/lib/zoho/zohoBooksService";
import { loadInvoiceAdjustmentsForAdmin } from "@/lib/admin/invoices/loadAdminInvoiceBundle";
import {
  bookingLineAmountCents,
  buildMonthlyInvoiceZohoLineItems,
} from "@/lib/monthlyInvoice/buildMonthlyInvoiceZohoLineItems";
import { resolveZohoCustomerContactForMonthlyInvoice } from "@/lib/zoho/resolveZohoCustomerContact";
import { zohoDatesForMonthlyInvoice, billingMonthInvoiceDate } from "@/lib/monthlyInvoice/monthlyInvoiceBillingDates";
import { refreshDraftMonthlyInvoiceDueDate } from "@/lib/monthlyInvoice/refreshDraftMonthlyInvoiceDueDate";
import { lastScheduledVisitYmd } from "@/lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";

async function loadBookingsSumCents(admin: SupabaseClient, invoiceId: string): Promise<number> {
  const { data, error } = await admin
    .from("bookings")
    .select("total_paid_zar, amount_paid_cents, status")
    .eq("monthly_invoice_id", invoiceId);

  if (error) throw error;

  let sum = 0;
  for (const row of data ?? []) {
    if (String((row as { status?: string }).status ?? "").toLowerCase() === "cancelled") continue;
    sum += bookingLineAmountCents(row as Record<string, unknown>);
  }
  return sum;
}

async function loadZohoLineItems(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    customerId: string;
    month: string;
    balanceZar: number;
    status?: string | null;
  },
) {
  const totalAmountCents = Math.round(params.balanceZar * 100);
  const { data: inv } = await admin
    .from("monthly_invoices")
    .select("status")
    .eq("id", params.invoiceId)
    .maybeSingle();
  const status = String(params.status ?? (inv as { status?: string } | null)?.status ?? "").toLowerCase();

  const [bookingsSumCents, adjustments] = await Promise.all([
    loadBookingsSumCents(admin, params.invoiceId),
    loadInvoiceAdjustmentsForAdmin(admin, params.invoiceId, params.customerId, params.month, status),
  ]);

  return buildMonthlyInvoiceZohoLineItems({
    month: params.month,
    bookingsSumCents,
    adjustments,
    totalAmountCents,
  });
}

type MonthlyInvoiceRow = {
  id: string;
  customer_id: string;
  month: string;
  due_date: string;
  status: string | null;
  total_amount_cents: number | null;
  zoho_invoice_id: string | null;
};

/**
 * Creates or updates a Zoho Books invoice for a monthly invoice and stores
 * `zoho_invoice_id` on the row. Draft rows update the linked Zoho draft when
 * totals change; finalized rows create once if unlinked.
 */
export async function syncMonthlyInvoiceToZohoBooks(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    customerId: string;
    month: string;
    dueDate: string;
    balanceZar: number;
    status?: string | null;
    paymentUrl?: string | null;
    invoiceDate?: string;
  },
): Promise<{ ok: true; zohoInvoiceId: string } | { ok: false; error: string }> {
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    return { ok: false, error: "zoho_not_configured" };
  }

  const balanceZar = Math.max(0, params.balanceZar);
  if (balanceZar <= 0) return { ok: false, error: "zero_balance" };

  let dueDateYmd = params.dueDate?.slice(0, 10);
  if (!dueDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dueDateYmd)) {
    const { data: bookingRows } = await admin
      .from("bookings")
      .select("date")
      .eq("monthly_invoice_id", params.invoiceId)
      .neq("status", "cancelled");
    const dates = (bookingRows ?? []).map((b) => String((b as { date: string }).date));
    dueDateYmd = lastScheduledVisitYmd(params.month, dates) ?? billingMonthInvoiceDate(params.month);
  }

  const zohoDates = zohoDatesForMonthlyInvoice(params.month, dueDateYmd);
  const invoiceDate = params.invoiceDate ?? zohoDates.invoiceDate;
  const dueDate = zohoDates.dueDate;
  const payNote = params.paymentUrl ? ` Pay via: ${params.paymentUrl}` : "";
  const notes = `Shalean monthly invoice ${params.invoiceId}.${payNote}`;

  const { data: existing } = await admin
    .from("monthly_invoices")
    .select("zoho_invoice_id, status")
    .eq("id", params.invoiceId)
    .maybeSingle();

  const row = existing as { zoho_invoice_id?: string | null; status?: string | null } | null;
  const linked = String(row?.zoho_invoice_id ?? "").trim();
  const rowStatus = String(params.status ?? row?.status ?? "").toLowerCase();

  const contactRes = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
    invoiceId: params.invoiceId,
    customerId: params.customerId,
  });
  if (!contactRes.ok) return { ok: false, error: contactRes.error };
  const contact = contactRes.contact;

  const lineItems = await loadZohoLineItems(admin, {
    invoiceId: params.invoiceId,
    customerId: params.customerId,
    month: params.month,
    balanceZar,
    status: rowStatus,
  });

  if (linked) {
    if (rowStatus !== "draft") {
      return { ok: true, zohoInvoiceId: linked };
    }

    const exists = await zohoInvoiceExists(linked);
    if (exists === false) {
      await admin.from("monthly_invoices").update({ zoho_invoice_id: null }).eq("id", params.invoiceId);
    } else {
      const updateRes = await updateZohoInvoice({
        zohoInvoiceId: linked,
        customerEmail: contact.email,
        customerName: contact.name,
        customerPhone: contact.phone,
        invoiceDate,
        dueDate,
        lineItems,
        notes,
        currencyCode: "ZAR",
      });
      if (!updateRes.ok) return { ok: false, error: updateRes.error };
      return { ok: true, zohoInvoiceId: linked };
    }
  }

  const zohoResult = await createZohoInvoice({
    referenceId: params.invoiceId,
    orderKind: "monthly",
    customerEmail: contact.email,
    customerName: contact.name,
    customerPhone: contact.phone,
    invoiceDate,
    dueDate,
    lineItems,
    notes,
    currencyCode: "ZAR",
  });

  if (!zohoResult.ok) return { ok: false, error: zohoResult.error };

  const { error: upErr } = await admin
    .from("monthly_invoices")
    .update({ zoho_invoice_id: zohoResult.zohoInvoiceId })
    .eq("id", params.invoiceId)
    .is("zoho_invoice_id", null);

  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, zohoInvoiceId: zohoResult.zohoInvoiceId };
}

/**
 * After `recompute_monthly_invoice_totals`, keep the linked Zoho draft in sync
 * for open monthly invoices. Fire-and-forget safe — logs nothing on skip.
 */
export async function syncDraftMonthlyInvoiceToZohoAfterRecompute(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<void> {
  const { data } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status, total_amount_cents, zoho_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();

  const row = data as MonthlyInvoiceRow | null;
  if (!row || String(row.status ?? "").toLowerCase() !== "draft") return;

  const balanceZar = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0))) / 100;
  if (balanceZar <= 0) return;

  await refreshDraftMonthlyInvoiceDueDate(admin, invoiceId);

  const { data: fresh } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status, total_amount_cents, zoho_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();

  const synced = fresh as MonthlyInvoiceRow | null;
  if (!synced) return;

  await syncMonthlyInvoiceToZohoBooks(admin, {
    invoiceId: synced.id,
    customerId: synced.customer_id,
    month: synced.month,
    dueDate: synced.due_date,
    balanceZar,
    status: synced.status,
  });
}
