import { NextResponse } from "next/server";
import {
  computeOfficeAnalyticsSummary,
  extractPriorCustomerIds,
  officeAnalyticsQueryStartIso,
  priorCustomerQueryEndIso,
  type OfficeAnalyticsBookingRow,
} from "@/lib/admin/officeAnalytics";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_SELECT =
  "id, created_at, updated_at, status, payment_status, payment_completed_at, total_paid_zar, amount_paid_cents, refunded_at, refund_status, billing_type, is_monthly_billing_booking, monthly_invoice_id, service, service_slug, customer_id, is_recurring_generated";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const now = new Date();
  const sinceIso = officeAnalyticsQueryStartIso(now);
  const priorEndIso = priorCustomerQueryEndIso(now);

  const [bookingsRes, priorCustomersRes] = await Promise.all([
    admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .or(`created_at.gte.${sinceIso},payment_completed_at.gte.${sinceIso}`)
      .order("created_at", { ascending: false })
      .limit(15000),
    admin
      .from("bookings")
      .select("customer_id, payment_status, payment_completed_at")
      .eq("payment_status", "success")
      .not("payment_completed_at", "is", null)
      .not("customer_id", "is", null)
      .lt("payment_completed_at", priorEndIso)
      .limit(20000),
  ]);

  if (bookingsRes.error) {
    return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });
  }
  if (priorCustomersRes.error) {
    return NextResponse.json({ error: priorCustomersRes.error.message }, { status: 500 });
  }

  const summary = computeOfficeAnalyticsSummary(
    (bookingsRes.data ?? []) as OfficeAnalyticsBookingRow[],
    extractPriorCustomerIds(priorCustomersRes.data ?? []),
    now,
  );

  return NextResponse.json(summary);
}
