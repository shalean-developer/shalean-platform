import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { zohoInvoicePdfResponse } from "@/lib/zoho/zohoInvoicePdfResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: streams the Zoho Books invoice PDF for a single (per-visit) booking.
 * Auth is cookie-based (admin office area) so a plain `<a href>` download works.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  const id = bookingId?.trim();
  if (!id) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const user = await getCookieUser();
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("bookings")
    .select("id, zoho_invoice_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return zohoInvoicePdfResponse(data.zoho_invoice_id, `shalean-invoice-${id.slice(0, 8)}`);
}
