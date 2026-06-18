import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/auth/admin";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { zohoInvoicePdfResponse } from "@/lib/zoho/zohoInvoicePdfResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: streams the Zoho Books invoice PDF for a monthly invoice.
 * Auth is cookie-based (admin office area) so a plain `<a href>` download works.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await ctx.params;
  const id = invoiceId?.trim();
  if (!id) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const user = await getCookieUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, month, zoho_invoice_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const monthLabel = typeof data.month === "string" ? data.month : id.slice(0, 8);
  return zohoInvoicePdfResponse(data.zoho_invoice_id, `shalean-invoice-${monthLabel}`);
}
