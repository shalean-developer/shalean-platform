import { NextResponse } from "next/server";
import {
  computeBookingProfitabilityRow,
  paginateBookingProfitabilityItems,
  sumTrustedBookingProfitTotals,
} from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";
import { normalizeOfficePayoutPeriodRange, bookingCustomerRevenueCents } from "@/lib/admin/payouts/officePayoutPeriodReport";
import {
  resolveBookingGatewayProcessingFeeCents,
  sumApprovedBookingOperatingExpenses,
} from "@/lib/payments/bookingPaymentFees";
import { loadReferralPromoCostsByBookingIds } from "@/lib/admin/referrals/loadReferralPromoCosts";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingProfitQueryRow = {
  id: string;
  booking_reference?: string | null;
  date: string;
  city_id?: string | null;
  cleaner_id?: string | null;
  service?: string | null;
  service_slug?: string | null;
  is_team_job?: boolean | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  total_paid_cents?: number | null;
  service_fee_cents?: number | null;
  company_revenue_cents?: number | null;
  earnings_summary?: unknown;
  cleaner_payout_cents?: number | null;
  display_earnings_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  cleaner_bonus_cents?: number | null;
  cities?: { name?: string } | null;
};

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

  // Period-wide fetch first so trusted_totals cover the selected period, not only the page.
  let query = admin
    .from("bookings")
    .select(
      "id, booking_reference, date, city_id, cleaner_id, service, service_slug, is_team_job, total_paid_zar, amount_paid_cents, total_paid_cents, service_fee_cents, company_revenue_cents, earnings_summary, cleaner_payout_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_bonus_cents, cities ( name )",
    )
    .eq("status", "completed")
    .eq("is_test", false)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });

  if (branchId) query = query.eq("city_id", branchId);
  if (cleanerId) query = query.eq("cleaner_id", cleanerId);
  if (serviceSlug) query = query.eq("service_slug", serviceSlug);

  const { data: periodBookings, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allBookings = (periodBookings ?? []) as BookingProfitQueryRow[];
  const bookingIds = allBookings.map((b) => String(b.id));
  const promoByBooking = await loadReferralPromoCostsByBookingIds(admin, bookingIds);

  const periodItems = await Promise.all(
    allBookings.map(async (b) => {
      const customerPayment = bookingCustomerRevenueCents(b);
      const bookingExpenses = await sumApprovedBookingOperatingExpenses(admin, b.id);
      const gatewayFees = await resolveBookingGatewayProcessingFeeCents(admin, b.id);
      const platformFees = Math.max(0, Math.round(Number(b.service_fee_cents) ?? 0));
      const promo = promoByBooking.get(String(b.id));
      const referralDiscount = promo?.referral_discount_cents ?? 0;
      const cleaningCredit = promo?.cleaning_credit_cents ?? 0;
      const profit = computeBookingProfitabilityRow(
        {
          is_team_job: b.is_team_job === true,
          cleaner_earnings_total_cents: b.cleaner_earnings_total_cents,
          display_earnings_cents: b.display_earnings_cents,
        },
        customerPayment,
        bookingExpenses,
        gatewayFees,
        platformFees,
        referralDiscount,
        cleaningCredit,
      );
      const city = b.cities as { name?: string } | null;
      const serviceLabel =
        (typeof b.service === "string" && b.service.trim()) ||
        (typeof b.service_slug === "string" && b.service_slug.trim()) ||
        "Unknown";
      return {
        booking_id: b.id,
        booking_reference: b.booking_reference ?? null,
        date: b.date,
        branch_name: city?.name ?? "Unknown",
        service_name: serviceLabel,
        cleaner_id: b.cleaner_id,
        is_team_job: b.is_team_job === true,
        ...profit,
      };
    }),
  );

  const trusted_totals = sumTrustedBookingProfitTotals(periodItems);
  const paged = paginateBookingProfitabilityItems(periodItems, page, pageSize);

  return NextResponse.json({
    period: { from, to },
    items: paged.items,
    trusted_totals,
    pagination: {
      page: paged.page,
      page_size: paged.page_size,
      total: paged.total,
    },
  });
}
