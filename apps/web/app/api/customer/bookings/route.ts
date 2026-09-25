import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT,
  CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT,
  loadCustomerBookingPageForUser,
} from "@/lib/customer/customerBookingPageForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadCustomerBookingRowsForUser } from "@/lib/customer/customerBookingsForUser";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import { isDashboardBookingAuthoritativelyCompleted } from "@/lib/dashboard/dashboardBookingOperational";
import { customerPaymentRowDisplay } from "@/lib/dashboard/customerPaymentDisplay";
import { perBookingInvoicesFromBookings } from "@/lib/dashboard/perBookingInvoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePageLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (!raw) return CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT;
  return Math.min(parsed, CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT);
}

/**
 * Canonical customer bookings list. The response is cursor-paged so account
 * consumers can progressively load older bookings without an unbounded query.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(supabaseUrl, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const url = new URL(request.url);
  const viewerEmail = typeof userData.user.email === "string" ? userData.user.email : null;
  if (url.searchParams.get("view") === "aggregates") {
    const complete = await loadCustomerBookingRowsForUser(admin, userData.user.id, { viewerEmail });
    if (!complete.ok) return NextResponse.json({ error: complete.error }, { status: complete.status });
    const mapped = complete.bookings.map((row) => mapBookingRow(row));
    const paymentRows = mapped.map((booking) => ({ booking, display: customerPaymentRowDisplay(booking) }));
    const paidRows = paymentRows.filter((row) => row.display.countsAsPaidTransaction);
    const perVisitInvoices = perBookingInvoicesFromBookings(mapped);
    return NextResponse.json({
      aggregates: {
        completedBookingsCount: mapped.filter(isDashboardBookingAuthoritativelyCompleted).length,
        payments: {
          totalPaidZar: paidRows.reduce((sum, row) => sum + row.booking.priceZar, 0),
          transactionCount: paidRows.length,
        },
        perBookingInvoices: {
          totalCount: perVisitInvoices.length,
          totalPaidCents: perVisitInvoices.reduce((sum, invoice) => sum + Math.round(invoice.amountZar * 100), 0),
        },
      },
    });
  }
  const out = await loadCustomerBookingPageForUser(admin, userData.user.id, {
    viewerEmail,
    cursor: url.searchParams.get("cursor"),
    limit: parsePageLimit(url),
    view: url.searchParams.get("view") === "upcoming"
      ? "upcoming"
      : url.searchParams.get("view") === "review_eligibility" ? "review_eligibility" : "all",
  });
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ bookings: out.bookings, pageInfo: out.pageInfo });
}
