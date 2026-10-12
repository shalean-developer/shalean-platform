import { NextResponse } from "next/server";
import {
  fetchBookingIdsWhereCleanerOnRoster,
  fetchCleanerVisibleBookingsMerged,
  isExplicitCleanerBookingAttribution,
} from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerDashboardEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchViewerPayoutByBookingIds } from "@/lib/cleaner/fetchViewerPayoutByBookingIds";
import { bookingHasActivePayoutAttributionRemoval } from "@/lib/payout/bookingPayoutAttributionRemoval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SummaryRow = {
  id?: unknown;
  date?: unknown;
  status?: unknown;
  cleaner_id?: unknown;
  payout_owner_cleaner_id?: unknown;
  viewer_payout_cents?: unknown;
  payout_frozen_cents?: unknown;
  display_earnings_cents?: unknown;
  cleaner_earnings_total_cents?: unknown;
  cleaner_payout_cents?: unknown;
  earnings_summary?: unknown;
  metadata?: unknown;
};

function ymdInJohannesburg(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function johannesburgRanges(now = new Date()) {
  const today = ymdInJohannesburg(now);
  const [year, month] = today.split("-").map(Number);
  const monthFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthTo = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);

  const noonUtc = new Date(`${today}T12:00:00.000Z`);
  const weekday = noonUtc.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const weekFrom = addDays(today, -daysSinceMonday);
  const weekTo = addDays(weekFrom, 7);

  return { today, weekFrom, weekTo, monthFrom, monthTo, month: monthFrom.slice(0, 7) };
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
  const ranges = johannesburgRanges();
  const { data, error } = await fetchCleanerVisibleBookingsMerged(admin, cleanerId, {
    select:
      "id, date, status, cleaner_id, payout_owner_cleaner_id, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, earnings_summary, metadata",
    perBranchLimit: 1000,
    applyEachBranch: (query) =>
      query.eq("status", "completed").gte("date", ranges.monthFrom).lt("date", ranges.monthTo),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const explicitRosterBookingIds = new Set(
    await fetchBookingIdsWhereCleanerOnRoster(admin, cleanerId, 10_000),
  );

  const unique = new Map<string, SummaryRow>();
  for (const raw of (data ?? []) as SummaryRow[]) {
    const id = String(raw.id ?? "").trim();
    if (!id || unique.has(id)) continue;
    const record = raw as Record<string, unknown>;
    if (!isExplicitCleanerBookingAttribution(record, cleanerId, explicitRosterBookingIds)) {
      continue;
    }
    if (bookingHasActivePayoutAttributionRemoval(record)) {
      continue;
    }
    unique.set(id, raw);
  }

  let viewerPayoutByBooking: Map<string, number>;
  try {
    viewerPayoutByBooking = await fetchViewerPayoutByBookingIds(admin, cleanerId, [...unique.keys()]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load cleaner payout allocations." },
      { status: 500 },
    );
  }

  let weeklyEarningsCents = 0;
  let monthlyEarningsCents = 0;

  for (const row of unique.values()) {
    const date = String(row.date ?? "").slice(0, 10);
    const bookingId = String(row.id ?? "").trim();
    const cents = Math.max(
      0,
      resolveCleanerDashboardEarningsCents(
        {
          ...(row as Record<string, unknown>),
          viewer_payout_cents: viewerPayoutByBooking.get(bookingId) ?? null,
        },
        cleanerId,
      ),
    );
    monthlyEarningsCents += cents;
    if (date >= ranges.weekFrom && date < ranges.weekTo) {
      weeklyEarningsCents += cents;
    }
  }

  return NextResponse.json({
    completed_jobs: unique.size,
    weekly_earnings_cents: weeklyEarningsCents,
    monthly_earnings_cents: monthlyEarningsCents,
    week_from: ranges.weekFrom,
    week_to: ranges.weekTo,
    month: ranges.month,
  });
}
