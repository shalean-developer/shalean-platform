import { NextResponse } from "next/server";

import { getCookieUser } from "@/lib/auth/getCookieUser";
import { ownsDocumentRow } from "@/lib/customer/documentOwnership";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { zohoInvoicePdfResponse } from "@/lib/zoho/zohoInvoicePdfResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams the Zoho Books invoice PDF for a single (per-visit) booking.
 * Auth is cookie-based so a plain `<a href>` download works; the caller must
 * own the booking (`user_id` match, or orphan email match when `user_id` unset).
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

  const owns = ownsDocumentRow(
    { ownerId: data.user_id, ownerEmail: data.customer_email },
    { id: user.id, email: user.email ?? null },
  );
  if (!owns) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return zohoInvoicePdfResponse(data.zoho_invoice_id, `shalean-invoice-${id.slice(0, 8)}`);
}
