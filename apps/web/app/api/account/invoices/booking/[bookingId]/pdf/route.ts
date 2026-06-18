import { NextResponse } from "next/server";

import { getCookieUser } from "@/lib/auth/getCookieUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { zohoInvoicePdfResponse } from "@/lib/zoho/zohoInvoicePdfResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams the Zoho Books invoice PDF for a single (per-visit) booking.
 * Auth is cookie-based so a plain `<a href>` download works; the caller must
 * own the booking (by `user_id` or matching `customer_email`).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await ctx.params;
  const id = bookingId?.trim();
  if (!id) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const user = await getCookieUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("bookings")
    .select("id, user_id, customer_email, zoho_invoice_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const owns =
    data.user_id === user.id ||
    (!!user.email &&
      !!data.customer_email &&
      String(data.customer_email).toLowerCase() === user.email.toLowerCase());
  if (!owns) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  return zohoInvoicePdfResponse(data.zoho_invoice_id, `shalean-invoice-${id.slice(0, 8)}`);
}
