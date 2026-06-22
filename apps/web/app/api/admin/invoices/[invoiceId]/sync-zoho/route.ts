import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { syncDraftMonthlyInvoiceToZohoAfterRecompute } from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rebuilds the linked Zoho draft from current bookings + adjustment lines. */
export async function POST(_request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(_request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: inv, error } = await admin
    .from("monthly_invoices")
    .select("id, status, zoho_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (String((inv as { status?: string }).status ?? "").toLowerCase() !== "draft") {
    return NextResponse.json({ error: "Only draft invoices can be re-synced to Zoho." }, { status: 409 });
  }

  await syncDraftMonthlyInvoiceToZohoAfterRecompute(admin, invoiceId);

  const { data: fresh } = await admin
    .from("monthly_invoices")
    .select("zoho_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    zohoInvoiceId: (fresh as { zoho_invoice_id?: string | null } | null)?.zoho_invoice_id ?? null,
  });
}
