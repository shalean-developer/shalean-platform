import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customer: list own recurring schedules.
 */
export async function GET(request: Request) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("recurring_bookings")
    .select(
      "id, address_id, frequency, days_of_week, start_date, end_date, price, status, next_run_date, last_generated_at, monthly_pattern, monthly_nth, created_at, updated_at",
    )
    .eq("customer_id", auth.session.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}
