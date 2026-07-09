import { NextResponse } from "next/server";
import { computeBookingProfit } from "@/lib/admin/expenses/profitCalculations";
import { normalizeOfficePayoutPeriodRange, bookingCustomerRevenueCents } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import {
  resolveBookingGatewayProcessingFeeCents,
  sumApprovedBookingOperatingExpenses,
} from "@/lib/payments/bookingPaymentFees";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const { from, to } = normalizeOfficePayoutPeriodRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  const branchId = url.searchParams.get("branch_id");
  const cleanerId = url.searchParams.get("cleaner_id");
  const serviceSlug = url.searchParams.get("service_id") ?? url.searchParams.get("service_slug");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") ?? 50)));

  let query = admin
    .from("bookings")
    .select(
      "id, date, city_id, cleaner_id, service, service_slug, total_paid_zar, amount_paid_cents, total_paid_cents, service_fee_cents, company_revenue_cents, earnings_summary, cleaner_payout_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_bonus_cents, cities ( name )",
      { count: "exact" },
    )
    .eq("status", "completed")
    .eq("is_test", false)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (branchId) query = query.eq("city_id", branchId);
  if (cleanerId) query = query.eq("cleaner_id", cleanerId);
  if (serviceSlug) query = query.eq("service_slug", serviceSlug);

  const { data: bookings, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = await Promise.all(
    (bookings ?? []).map(async (b) => {
      const customerPayment = bookingCustomerRevenueCents(b);
      const cleanerPayment = Math.max(
        0,
        Math.round(resolveCleanerEarningsCents(b) ?? Number(b.cleaner_payout_cents) ?? 0),
      );
      const bookingExpenses = await sumApprovedBookingOperatingExpenses(admin, b.id);
      const gatewayFees = await resolveBookingGatewayProcessingFeeCents(admin, b.id);
      const platformFees = Math.max(0, Math.round(Number(b.service_fee_cents) ?? 0));
      const profit = computeBookingProfit(
        customerPayment,
        cleanerPayment,
        bookingExpenses,
        gatewayFees,
        platformFees,
      );
      const city = b.cities as { name?: string } | null;
      const serviceLabel =
        (typeof b.service === "string" && b.service.trim()) ||
        (typeof b.service_slug === "string" && b.service_slug.trim()) ||
        "Unknown";
      return {
        booking_id: b.id,
        date: b.date,
        branch_name: city?.name ?? "Unknown",
        service_name: serviceLabel,
        cleaner_id: b.cleaner_id,
        ...profit,
      };
    }),
  );

  return NextResponse.json({
    period: { from, to },
    items,
    pagination: { page, page_size: pageSize, total: count ?? 0 },
  });
}
