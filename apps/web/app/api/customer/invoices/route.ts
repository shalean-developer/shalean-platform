import { NextResponse } from "next/server";
import { loadCustomerInvoicesList } from "@/lib/customer/customerInvoicesList";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customer billing list — monthly invoices + paid per-visit bookings. */
export async function GET(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const loaded = await loadCustomerInvoicesList(admin, auth.userId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 });
  return NextResponse.json(loaded.data);
}
