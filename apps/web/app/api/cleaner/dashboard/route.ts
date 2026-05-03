import { NextResponse } from "next/server";
import { getCleanerVisibleBookingsOrFilter } from "@/lib/cleaner/cleanerBookingAccess";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import {
  suggestedDailyGoalCentsFromWireRows,
  todayCentsAndBreakdownFromBookings,
  type CleanerDashboardEarningsWireRow,
} from "@/lib/cleaner/cleanerDashboardTodayCents";
import { assignedOfferPastAcceptanceDeadline } from "@/lib/cleaner/cleanerAssignedOfferExpiry";
import { dedupeBookingsById, prioritizeDashboardJobsForDisplay } from "@/lib/cleaner-dashboard/prioritizeDashboardJobs";
import { getJhbTodayRange } from "@/lib/dashboard/johannesburgMonth";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCleanerDashboardCache, setCleanerDashboardCache } from "@/app/api/cleaner/dashboard/dashboardResponseCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DASHBOARD_BOOKING_SELECT =
  "id, date, time, location, status, service, customer_name, completed_at, created_at, cleaner_response_status, cleaner_earnings_total_cents, payout_frozen_cents, display_earnings_cents";

function wireDashboardJob(raw: Record<string, unknown>): CleanerBookingRow {
  return {
    id: String(raw.id ?? ""),
    service: (raw.service as string | null | undefined) ?? null,
    date: (raw.date as string | null | undefined) ?? null,
    time: (raw.time as string | null | undefined) ?? null,
    location: (raw.location as string | null | undefined) ?? null,
    status: (raw.status as string | null | undefined) ?? null,
    cleaner_response_status: (raw.cleaner_response_status as string | null | undefined) ?? null,
    total_paid_zar: null,
    customer_name: (raw.customer_name as string | null | undefined) ?? null,
    customer_phone: null,
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: (raw.completed_at as string | null | undefined) ?? null,
    created_at: (raw.created_at as string | null | undefined) ?? null,
    cleaner_earnings_total_cents: raw.cleaner_earnings_total_cents as number | null | undefined,
    payout_frozen_cents: raw.payout_frozen_cents as number | null | undefined,
    display_earnings_cents: raw.display_earnings_cents as number | null | undefined,
  };
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }
  const cleanerId = session.cleanerId;

  const { data: c } = await admin.from("cleaners").select("id").eq("id", cleanerId).maybeSingle();
  if (!c) {
    return NextResponse.json({ error: "Not a cleaner account." }, { status: 403 });
  }

  const cached = getCleanerDashboardCache(cleanerId);
  if (cached != null) {
    return NextResponse.json(cached);
  }

  const { orFilter } = await getCleanerVisibleBookingsOrFilter(admin, cleanerId);

  const { data: rows, error } = await admin
    .from("bookings")
    .select(DASHBOARD_BOOKING_SELECT)
    .or(orFilter)
    .not("status", "eq", "failed")
    .not("status", "eq", "pending_payment")
    .not("status", "eq", "payment_expired")
    .order("date", { ascending: true })
    .order("time", { ascending: true })
    .limit(80);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rawList = (rows ?? []) as Record<string, unknown>[];
  const now = new Date();
  const { todayYmd } = getJhbTodayRange(now);
  const wired = rawList
    .map(wireDashboardJob)
    .filter((row) => !assignedOfferPastAcceptanceDeadline(row));
  const jobs = prioritizeDashboardJobsForDisplay(dedupeBookingsById(wired), now, 12, todayYmd);

  const { today_cents, today_breakdown } = todayCentsAndBreakdownFromBookings(
    rawList as unknown as CleanerDashboardEarningsWireRow[],
    now,
  );
  const suggested_daily_goal_cents = suggestedDailyGoalCentsFromWireRows(
    rawList as unknown as CleanerDashboardEarningsWireRow[],
    now,
  );

  const body = {
    jobs,
    summary: {
      today_cents,
      today_breakdown,
      suggested_daily_goal_cents,
      /** Client skew correction for countdown / urgency (epoch ms). */
      server_now_ms: Date.now(),
      /** Same calendar rules as earnings card (Johannesburg). */
      earnings_timezone: "Africa/Johannesburg",
    },
  };
  setCleanerDashboardCache(cleanerId, body);
  return NextResponse.json(body);
}
