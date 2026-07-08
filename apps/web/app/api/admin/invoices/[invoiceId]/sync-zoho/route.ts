import { NextResponse } from "next/server";

import { syncBillingDocumentToZoho } from "@/lib/admin/billing/syncBillingDocumentToZoho";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { monthlyInvoiceZohoSyncErrorMessage } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceZohoTotalCents";
import {
  syncDraftMonthlyInvoiceToZohoAfterRecompute,
} from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates or refreshes the Zoho Books invoice for a monthly invoice row. */
export async function POST(_request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(_request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: inv, error } = await admin
    .from("monthly_invoices")
    .select("id, status, zoho_invoice_id, total_amount_cents")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const status = String((inv as { status?: string }).status ?? "").toLowerCase();
  const linked = String((inv as { zoho_invoice_id?: string | null }).zoho_invoice_id ?? "").trim();

  if (linked && status === "draft") {
    await syncDraftMonthlyInvoiceToZohoAfterRecompute(admin, invoiceId);
  } else if (!linked) {
    const totalCents = Math.max(0, Math.round(Number((inv as { total_amount_cents?: number }).total_amount_cents ?? 0)));
    if (totalCents <= 0) {
      return NextResponse.json({ error: monthlyInvoiceZohoSyncErrorMessage("zero_balance") }, { status: 422 });
    }
    const result = await syncBillingDocumentToZoho(admin, { kind: "monthly_invoice", id: invoiceId });
    if (!result.ok) {
      return NextResponse.json(
        { error: monthlyInvoiceZohoSyncErrorMessage(result.error) },
        { status: 422 },
      );
    }
  }

  const { data: fresh } = await admin
    .from("monthly_invoices")
    .select("zoho_invoice_id, zoho_invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();

  const freshRow = fresh as { zoho_invoice_id?: string | null; zoho_invoice_number?: string | null } | null;
  const zohoInvoiceId =
    String(freshRow?.zoho_invoice_id ?? "").trim() || linked || null;
  const zohoInvoiceNumber = String(freshRow?.zoho_invoice_number ?? "").trim() || null;

  if (!zohoInvoiceId) {
    return NextResponse.json({ error: "Zoho sync did not link an invoice." }, { status: 422 });
  }

  return NextResponse.json({ ok: true, zohoInvoiceId, zohoInvoiceNumber });
}
