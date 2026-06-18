import { NextResponse } from "next/server";

import { getCookieUser } from "@/lib/auth/getCookieUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { zohoInvoicePdfResponse } from "@/lib/zoho/zohoInvoicePdfResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams the Zoho Books invoice PDF for a customer's monthly invoice.
 * Auth is cookie-based so a plain `<a href>` download works; the invoice must
 * belong to the signed-in customer (`customer_id`).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await ctx.params;
  const id = invoiceId?.trim();
  if (!id) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const user = await getCookieUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, zoho_invoice_id")
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const monthLabel = typeof data.month === "string" ? data.month : id.slice(0, 8);
  return zohoInvoicePdfResponse(data.zoho_invoice_id, `shalean-invoice-${monthLabel}`);
}
