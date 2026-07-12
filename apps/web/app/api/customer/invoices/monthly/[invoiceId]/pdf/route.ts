import { NextResponse } from "next/server";
import { resolveCustomerRequestUser } from "@/lib/customer/resolveCustomerRequestUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { zohoInvoicePdfResponse } from "@/lib/zoho/zohoInvoicePdfResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monthly invoice PDF — cookie (web) or Bearer (mobile).
 * Ownership: monthly_invoices.customer_id must match the authenticated user.
 */
export async function GET(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await ctx.params;
  const id = invoiceId?.trim();
  if (!id) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const resolved = await resolveCustomerRequestUser(request);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!resolved.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, zoho_invoice_id")
    .eq("id", id)
    .eq("customer_id", resolved.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const monthLabel = typeof data.month === "string" ? data.month : id.slice(0, 8);
  return zohoInvoicePdfResponse(data.zoho_invoice_id, `shalean-invoice-${monthLabel}`);
}
