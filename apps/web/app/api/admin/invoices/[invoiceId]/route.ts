import { NextResponse } from "next/server";

import { loadAdminInvoiceBundle } from "@/lib/admin/invoices/loadAdminInvoiceBundle";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { updateMonthlyInvoiceBillingDates } from "@/lib/monthlyInvoice/updateMonthlyInvoiceBillingDates";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const bundle = await loadAdminInvoiceBundle(admin, invoiceId);
  if (!bundle.ok) {
    if (bundle.error === "not_found") return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    return NextResponse.json({ error: bundle.message ?? "Load failed." }, { status: 500 });
  }

  return NextResponse.json(bundle.data);
}

function friendlyBillingDateError(code: string): string {
  switch (code) {
    case "not_found":
      return "Invoice not found.";
    case "invoice_already_closed":
      return "This invoice is closed and cannot be edited.";
    case "invalid_due_date":
      return "Due date must be YYYY-MM-DD.";
    case "invalid_invoice_date":
      return "Invoice date must be YYYY-MM-DD.";
    case "due_date_must_be_in_billing_month":
      return "For draft invoices, due date must fall within the billing month.";
    case "no_dates_provided":
      return "Provide invoiceDate and/or dueDate.";
    default:
      return code;
  }
}

/** Update invoice document date and/or payment due date (any non-closed status). */
export async function PATCH(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as {
    dueDate?: unknown;
    invoiceDate?: unknown;
  };

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await updateMonthlyInvoiceBillingDates(admin, {
    invoiceId,
    dueDate: body.dueDate === undefined ? undefined : String(body.dueDate ?? "").trim() || null,
    invoiceDate:
      body.invoiceDate === undefined ? undefined : String(body.invoiceDate ?? "").trim() || null,
    adminEmail: auth.email ?? undefined,
  });

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "invoice_already_closed"
          ? 409
          : 400;
    return NextResponse.json({ error: friendlyBillingDateError(result.error) }, { status });
  }

  return NextResponse.json({
    ok: true,
    dueDate: result.dueDate,
    invoiceDate: result.invoiceDate,
    zohoSynced: result.zohoSynced,
    ...(result.zohoError ? { zohoError: result.zohoError } : {}),
  });
}
