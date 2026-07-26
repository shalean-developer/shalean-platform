import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { bookingCustomerRevenueCents } from "@/lib/admin/payouts/officePayoutPeriodReport";
import {
  resolveBookingGatewayProcessingFeeCents,
  sumApprovedBookingOperatingExpenses,
} from "@/lib/payments/bookingPaymentFees";
import { loadPaymentTransactionForBooking } from "@/lib/payments/recordGatewayPayment";
import { computeBookingProfitabilityRow } from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  const auth = await requireFinanceApi(_request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;

  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "id, is_team_job, total_paid_zar, amount_paid_cents, total_paid_cents, service_fee_cents, company_revenue_cents, earnings_summary, cleaner_payout_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_bonus_cents",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const customerPayment = bookingCustomerRevenueCents(booking);
  const bookingExpenses = await sumApprovedBookingOperatingExpenses(admin, id);
  const gatewayFees = await resolveBookingGatewayProcessingFeeCents(admin, id);
  const platformFees = Math.max(0, Math.round(Number(booking.service_fee_cents) ?? 0));
  const profit = computeBookingProfitabilityRow(
    {
      is_team_job: booking.is_team_job === true,
      cleaner_earnings_total_cents: booking.cleaner_earnings_total_cents,
      display_earnings_cents: booking.display_earnings_cents,
    },
    customerPayment,
    bookingExpenses,
    gatewayFees,
    platformFees,
  );

  const paymentTransaction = await loadPaymentTransactionForBooking(admin, id);

  const { data: expenses } = await admin
    .from("expenses")
    .select("id, expense_date, description, amount_cents, status, expense_categories ( name )")
    .eq("booking_id", id)
    .order("expense_date", { ascending: false });

  return NextResponse.json({
    profit,
    payment_transaction: paymentTransaction,
    expenses: expenses ?? [],
  });
}
