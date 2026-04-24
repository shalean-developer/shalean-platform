import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const { data: c } = await admin.from("cleaners").select("id").eq("id", session.cleanerId).maybeSingle();
  if (!c) {
    return NextResponse.json({ error: "Not a cleaner account." }, { status: 403 });
  }

  const { data: jobs, error } = await admin
    .from("bookings")
    .select(
      "id, service, date, time, location, status, total_paid_zar, total_price, price_breakdown, pricing_version_id, amount_paid_cents, customer_name, customer_phone, extras, assigned_at, en_route_at, started_at, completed_at, created_at, booking_snapshot, cleaner_payout_cents, cleaner_bonus_cents, company_revenue_cents, payout_id",
    )
    .eq("cleaner_id", session.cleanerId)
    .not("status", "eq", "cancelled")
    .not("status", "eq", "failed")
    .not("status", "eq", "pending_payment")
    .order("date", { ascending: true })
    .order("time", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [] });
}
