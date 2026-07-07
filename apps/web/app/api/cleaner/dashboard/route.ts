import { NextResponse } from "next/server";
import {
  bookingMatchesRecurringCleanerPendingPayment,
  cleanerPendingPaymentBannerForRow,
  fetchCleanerVisibleBookingsMerged,
  sortBookingsByDateThenTime,
} from "@/lib/cleaner/cleanerBookingAccess";
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
import {
  applyPreviewEarningsToCleanerJobRows,
  DEFAULT_CLEANER_JOB_EARNINGS_PREVIEW_CAP,
} from "@/lib/cleaner/applyPreviewEarningsToCleanerJobRows";
import { buildDashboardLifecycleAlignmentWire } from "@/lib/booking/readModels/bookingReadModel";
import {
  isStuckNullEarningsBooking,
  maybeLogStuckNullEarnings,
} from "@/lib/cleaner/cleanerPayoutInvariantLogging";
import { scheduleStuckEarningsRecomputeDebounced } from "@/lib/cleaner/scheduleStuckEarningsRecompute";
import { augmentCleanerJobsWithViewerRosterContext } from "@/lib/cleaner/pairedRosterMemberLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DASHBOARD_BOOKING_SELECT =
  "id, date, time, location, status, dispatch_status, service, service_slug, customer_name, completed_at, created_at, cleaner_response_status, assigned_at, accepted_at, en_route_at, started_at, cleaner_earnings_total_cents, payout_frozen_cents, display_earnings_cents, earnings_summary, is_team_job, team_id, cleaner_id, selected_cleaner_id, cleaner_count, assignment_type, fallback_reason, payment_needs_follow_up, is_recurring_generated, billing_type, monthly_invoice_id";

function wireDashboardJob(raw: Record<string, unknown>): CleanerBookingRow {
  return {
    id: String(raw.id ?? ""),
    service: (raw.service as string | null | undefined) ?? null,
    service_slug: (raw.service_slug as string | null | undefined) ?? null,
    date: (raw.date as string | null | undefined) ?? null,
    time: (raw.time as string | null | undefined) ?? null,
    location: (raw.location as string | null | undefined) ?? null,
    status: (raw.status as string | null | undefined) ?? null,
    dispatch_status: (raw.dispatch_status as string | null | undefined) ?? null,
    cleaner_response_status: (raw.cleaner_response_status as string | null | undefined) ?? null,
    total_paid_zar: null,
    customer_name: (raw.customer_name as string | null | undefined) ?? null,
    customer_phone: null,
    assigned_at: (raw.assigned_at as string | null | undefined) ?? null,
    accepted_at: (raw.accepted_at as string | null | undefined) ?? null,
    en_route_at: (raw.en_route_at as string | null | undefined) ?? null,
    started_at: (raw.started_at as string | null | undefined) ?? null,
    completed_at: (raw.completed_at as string | null | undefined) ?? null,
    created_at: (raw.created_at as string | null | undefined) ?? null,
    cleaner_earnings_total_cents: raw.cleaner_earnings_total_cents as number | null | undefined,
    payout_frozen_cents: raw.payout_frozen_cents as number | null | undefined,
    display_earnings_cents: raw.display_earnings_cents as number | null | undefined,
    is_team_job: raw.is_team_job === true,
    team_id: (raw.team_id as string | null | undefined) ?? null,
    cleaner_id: (raw.cleaner_id as string | null | undefined) ?? undefined,
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

  const { data: mergedRows, error } = await fetchCleanerVisibleBookingsMerged(admin, cleanerId, {
    select: DASHBOARD_BOOKING_SELECT,
    perBranchLimit: 240,
    applyEachBranch: (q) =>
      q.not("status", "eq", "failed").not("status", "eq", "payment_expired").order("date", { ascending: true }).order("time", { ascending: true }),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rawList = sortBookingsByDateThenTime((mergedRows ?? []) as Record<string, unknown>[]).slice(0, 80);
  const now = new Date();
  const { todayYmd } = getJhbTodayRange(now);
  const wired = rawList
    .map((raw) => {
      const row = wireDashboardJob(raw);
      const rec = raw as Record<string, unknown>;
      const banner = cleanerPendingPaymentBannerForRow(rec);
      const visMode =
        String(rec.status ?? "").trim().toLowerCase() === "pending_payment" && bookingMatchesRecurringCleanerPendingPayment(rec)
          ? ("recurring_pending_payment" as const)
          : null;
      const dashboardLifecycle = buildDashboardLifecycleAlignmentWire(rec);
      const base = { ...row, dashboardLifecycle };
      if (!banner && !visMode) return base;
      return {
        ...base,
        ...(banner ? { cleaner_pending_payment_banner: banner } : {}),
        ...(visMode ? { cleaner_visibility_mode: visMode } : {}),
      };
    })
    .filter((row) => !assignedOfferPastAcceptanceDeadline(row));
  const prioritized = prioritizeDashboardJobsForDisplay(dedupeBookingsById(wired), now, 12, todayYmd);
  const withRosterContext = await augmentCleanerJobsWithViewerRosterContext(
    admin,
    prioritized as unknown as Record<string, unknown>[],
    cleanerId,
  );
  const jobs = (await applyPreviewEarningsToCleanerJobRows(admin, {
    cleanerId,
    rows: withRosterContext,
    maxPreviews: DEFAULT_CLEANER_JOB_EARNINGS_PREVIEW_CAP,
  })) as unknown as typeof prioritized;

  for (const j of jobs as Record<string, unknown>[]) {
    const id = String(j.id ?? "").trim();
    if (!id) continue;
    maybeLogStuckNullEarnings(id, j);
    if (isStuckNullEarningsBooking(j)) {
      scheduleStuckEarningsRecomputeDebounced({
        admin,
        bookingId: id,
        cleanerId,
        recomputeSource: "jobs_list",
      });
    }
  }

  const { today_cents, today_breakdown } = todayCentsAndBreakdownFromBookings(
    rawList as unknown as CleanerDashboardEarningsWireRow[],
    now,
    cleanerId,
  );
  const suggested_daily_goal_cents = suggestedDailyGoalCentsFromWireRows(
    rawList as unknown as CleanerDashboardEarningsWireRow[],
    now,
    cleanerId,
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
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
