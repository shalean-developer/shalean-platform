import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { OfficeScheduleDayBooking } from "@/lib/admin/officeScheduleDayPresentation";
import { computeOfficeVisitDayFinance } from "@/lib/admin/dashboardVisitDayFinance";
import { getEffectiveAdminScope } from "@/lib/admin/effectiveAdminScope";
import { computeOfficeTodayScheduleStats } from "@/lib/admin/officeTodayScheduleStats";
import { fetchTeamRosterByBookingIds } from "@/lib/cleaner/fetchTeamRosterByBookingIds";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_SELECT =
  "id,date,time,status,cleaner_id,selected_cleaner_id,team_id,is_team_job,customer_name,service,service_slug,location,dispatch_status,duration_minutes,estimated_duration_minutes,estimated_finish_at,pricing_summary,booking_snapshot,payment_status,payment_completed_at,payment_method,total_paid_zar,amount_paid_cents,total_price,refunded_at,refund_status,billing_type,is_monthly_billing_booking,monthly_invoice_id";

type ScheduleDayBookingRow = OfficeScheduleDayBooking & {
  payment_status?: string | null;
  payment_completed_at?: string | null;
  payment_method?: string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  total_price?: number | null;
  refunded_at?: string | null;
  refund_status?: string | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
};

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function validUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

async function activeTeamCleanerIds(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  teamId: string,
  date: string,
): Promise<string[]> {
  const start = `${date}T00:00:00+02:00`;
  const end = `${date}T23:59:59.999+02:00`;
  const { data, error } = await admin
    .from("team_members")
    .select("cleaner_id,active_from,active_to")
    .eq("team_id", teamId)
    .or(`active_from.is.null,active_from.lte.${end}`)
    .or(`active_to.is.null,active_to.gte.${start}`);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => String(row.cleaner_id ?? "")).filter(validUuid))];
}

async function attachRoster(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  bookings: ScheduleDayBookingRow[],
): Promise<ScheduleDayBookingRow[]> {
  if (!bookings.length) return bookings;
  const ids = bookings.map((row) => String(row.id));
  const rosterMap = await fetchTeamRosterByBookingIds(admin, ids);
  const directIds = [...new Set(bookings.map((row) => String(row.cleaner_id ?? "")).filter(validUuid))];
  const directNames = new Map<string, string | null>();
  if (directIds.length) {
    const { data } = await admin.from("cleaners").select("id,full_name").in("id", directIds);
    for (const cleaner of data ?? []) directNames.set(String(cleaner.id), cleaner.full_name ?? null);
  }
  return bookings.map((row) => {
    const roster = rosterMap.get(String(row.id)) ?? [];
    const directId = String(row.cleaner_id ?? "");
    return {
      ...row,
      booking_cleaners:
        roster.length || !validUuid(directId)
          ? [...roster]
          : [{ cleaner_id: directId, full_name: directNames.get(directId) ?? null, role: "lead" }],
    };
  });
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = getSupabaseAdmin();
  if (!url || !anon || !admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await publicClient.auth.getUser(token);
  if (userError || !user?.id) return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });

  const { scope, error: scopeError } = await getEffectiveAdminScope(admin, user.id);
  if (scopeError || !scope) return NextResponse.json({ error: "Scope resolution unavailable." }, { status: 503 });
  if (!scope.permissions.includes("booking.view") && !scope.permissions.includes("team.view")) {
    return NextResponse.json({ error: "Access restricted." }, { status: 403 });
  }

  const date = new URL(request.url).searchParams.get("date")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Query `date` must be YYYY-MM-DD." }, { status: 400 });
  }

  const cleanerId = new URL(request.url).searchParams.get("cleanerId")?.trim() ?? "";
  const isSupervisor = scope.roles.includes("supervisor");
  if (isSupervisor && scope.teams.length !== 1) {
    return NextResponse.json({ error: "Exactly one team assignment is required for Supervisor schedule access." }, { status: 503 });
  }

  try {
    let bookingsQuery = admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("date", date)
      .order("time", { ascending: true })
      .order("id", { ascending: true });

    if (isSupervisor) {
      bookingsQuery = bookingsQuery.eq("team_id", scope.teams[0]);
    } else if (validUuid(cleanerId)) {
      bookingsQuery = bookingsQuery.or(
        `and(cleaner_id.is.null,selected_cleaner_id.is.null),cleaner_id.eq.${cleanerId},selected_cleaner_id.eq.${cleanerId}`,
      );
    }

    const { data: bookingRows, error: bookingsError } = await bookingsQuery;
    if (bookingsError) throw new Error(bookingsError.message);
    const bookings = await attachRoster(admin, (bookingRows ?? []) as ScheduleDayBookingRow[]);

    let cleanerIds: string[] | null = null;
    if (isSupervisor) cleanerIds = await activeTeamCleanerIds(admin, scope.teams[0], date);

    let cleanersQuery = admin
      .from("cleaners")
      .select("id,full_name,phone,is_available,status,is_active,availability_weekdays")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true });
    if (cleanerIds) {
      if (cleanerIds.length === 0) {
        return NextResponse.json({
          date,
          bookings,
          cleaners: [],
          summary: computeOfficeTodayScheduleStats(bookings),
          finance: null,
          truncated: false,
          scannedBookings: bookings.length,
          scoped: true,
        }, { headers: { "Cache-Control": "private, no-store" } });
      }
      cleanersQuery = cleanersQuery.in("id", cleanerIds);
    }

    const { data: cleaners, error: cleanersError } = await cleanersQuery;
    if (cleanersError) throw new Error(cleanersError.message);

    const canViewRevenue = scope.permissions.includes("finance.customer_revenue.view");
    return NextResponse.json({
      date,
      bookings,
      cleaners: cleaners ?? [],
      summary: computeOfficeTodayScheduleStats(bookings),
      finance: canViewRevenue ? computeOfficeVisitDayFinance(bookings) : null,
      truncated: false,
      scannedBookings: bookings.length,
      scoped: isSupervisor,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load schedule." },
      { status: 500 },
    );
  }
}
