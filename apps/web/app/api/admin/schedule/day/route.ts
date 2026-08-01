import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import type { OfficeScheduleDayBooking } from "@/lib/admin/officeScheduleDayPresentation";
import { computeOfficeVisitDayFinance } from "@/lib/admin/dashboardVisitDayFinance";
import { computeOfficeTodayScheduleStats } from "@/lib/admin/officeTodayScheduleStats";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import { fetchTeamRosterByBookingIds } from "@/lib/cleaner/fetchTeamRosterByBookingIds";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_SELECT =
  "id, date, time, status, cleaner_id, selected_cleaner_id, team_id, is_team_job, customer_name, service, service_slug, location, ignore_cleaner_conflict, cleaner_slot_override_reason, dispatch_status, duration_minutes, estimated_duration_minutes, estimated_finish_at, pricing_summary, booking_snapshot, payment_status, payment_completed_at, payment_method, total_paid_zar, amount_paid_cents, total_price, refunded_at, refund_status, billing_type, is_monthly_billing_booking, monthly_invoice_id";

const ROSTER_CHUNK = 200;
const BOOKING_PAGE_SIZE = 500;
const MAX_DAY_BOOKINGS = 10_000;

type ScheduleDayBookingRow = OfficeScheduleDayBooking & {
  ignore_cleaner_conflict?: boolean | null;
  cleaner_slot_override_reason?: string | null;
};

async function fetchAllScheduleDayBookings(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  date: string,
  cleanerId: string,
): Promise<{ bookings: ScheduleDayBookingRow[]; truncated: boolean }> {
  const bookings: ScheduleDayBookingRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + BOOKING_PAGE_SIZE - 1;
    let q = admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("date", date)
      .order("time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (/^[0-9a-f-]{36}$/i.test(cleanerId)) {
      q = q.or(
        `and(cleaner_id.is.null,selected_cleaner_id.is.null),cleaner_id.eq.${cleanerId},selected_cleaner_id.eq.${cleanerId}`,
      );
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as ScheduleDayBookingRow[];
    bookings.push(...chunk);

    if (chunk.length < BOOKING_PAGE_SIZE) {
      return { bookings, truncated: false };
    }

    from += BOOKING_PAGE_SIZE;
    if (from >= MAX_DAY_BOOKINGS) {
      return { bookings, truncated: true };
    }
  }
}

async function attachRosterToScheduleBookings(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  bookings: ScheduleDayBookingRow[],
): Promise<ScheduleDayBookingRow[]> {
  if (!bookings.length) return bookings;
  const ids = bookings.map((row) => String(row.id ?? "").trim()).filter(Boolean);
  const rosterMap = new Map<string, Array<{ cleaner_id: string; full_name: string | null; role: string }>>();
  for (let i = 0; i < ids.length; i += ROSTER_CHUNK) {
    const slice = ids.slice(i, i + ROSTER_CHUNK);
    const chunk = await fetchTeamRosterByBookingIds(admin, slice);
    for (const [bookingId, members] of chunk) rosterMap.set(bookingId, [...members]);
  }

  const directCleanerIds = [
    ...new Set(
      bookings
        .map((row) => String(row.cleaner_id ?? "").trim())
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    ),
  ];
  const directCleanerNameMap = new Map<string, string | null>();
  for (let i = 0; i < directCleanerIds.length; i += ROSTER_CHUNK) {
    const slice = directCleanerIds.slice(i, i + ROSTER_CHUNK);
    const { data: cleanerRows } = await admin.from("cleaners").select("id, full_name").in("id", slice);
    for (const cleaner of cleanerRows ?? []) {
      const row = cleaner as { id?: string; full_name?: string | null };
      const id = String(row.id ?? "").trim();
      if (id) directCleanerNameMap.set(id, row.full_name?.trim() ? row.full_name.trim() : null);
    }
  }

  return bookings.map((row) => {
    const bookingId = String(row.id ?? "").trim();
    const directCleanerId = String(row.cleaner_id ?? "").trim();
    const roster = rosterMap.get(bookingId) ?? [];
    const booking_cleaners =
      roster.length > 0 || !directCleanerId
        ? roster
        : [
            {
              cleaner_id: directCleanerId,
              full_name: directCleanerNameMap.get(directCleanerId) ?? null,
              role: "lead",
            },
          ];
    return { ...row, booking_cleaners };
  });
}

/**
 * Admin: bookings for a single calendar day (schedule board).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
  }

  const date = new URL(request.url).searchParams.get("date")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Query `date` must be YYYY-MM-DD." }, { status: 400 });
  }

  const cleanerId = new URL(request.url).searchParams.get("cleanerId")?.trim() ?? "";

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let dayBookings: ScheduleDayBookingRow[];
  let bookingsTruncated = false;
  try {
    const fetched = await fetchAllScheduleDayBookings(admin, date, cleanerId);
    dayBookings = fetched.bookings;
    bookingsTruncated = fetched.truncated;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load schedule bookings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const bookingsWithRoster = await attachRosterToScheduleBookings(admin, dayBookings);

  const cleanerSelectWithRoster =
    "id, full_name, phone, is_available, status, is_active, availability_weekdays";
  const cleanerSelectBase = "id, full_name, phone, is_available, status, is_active";
  let { data: cleanerRows, error: cErr } = await admin
    .from("cleaners")
    .select(cleanerSelectWithRoster)
    .or("is_active.is.null,is_active.eq.true")
    .order("full_name", { ascending: true });

  if (cErr && isUnknownColumnError(cErr, "availability_weekdays")) {
    const fallback = await admin
      .from("cleaners")
      .select(cleanerSelectBase)
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true });
    cleanerRows = (fallback.data ?? []).map((row) => ({ ...row, availability_weekdays: null }));
    cErr = fallback.error;
  }

  if (cErr && isUnknownColumnError(cErr, "is_active")) {
    const fallback = await admin
      .from("cleaners")
      .select("id, full_name, phone, is_available, status, availability_weekdays")
      .order("full_name", { ascending: true });
    if (fallback.error && isUnknownColumnError(fallback.error, "availability_weekdays")) {
      const base = await admin.from("cleaners").select("id, full_name, phone, is_available, status").order("full_name", {
        ascending: true,
      });
      cleanerRows = (base.data ?? []).map((row) => ({ ...row, availability_weekdays: null, is_active: true }));
      cErr = base.error;
    } else {
      cleanerRows = (fallback.data ?? []).map((row) => ({ ...row, is_active: true }));
      cErr = fallback.error;
    }
  }

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  return NextResponse.json({
    date,
    bookings: bookingsWithRoster,
    cleaners: cleanerRows ?? [],
    summary: computeOfficeTodayScheduleStats(bookingsWithRoster),
    finance: computeOfficeVisitDayFinance(bookingsWithRoster),
    truncated: bookingsTruncated,
    scannedBookings: bookingsWithRoster.length,
  });
}
