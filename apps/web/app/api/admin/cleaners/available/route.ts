import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { BOOKING_CLEANER_SLOT_OCCUPYING_STATUSES } from "@/lib/booking/bookingCleanerSlotOccupyingStatuses";
import { normalizeTimeHm } from "@/lib/admin/validateAdminBookingSlot";
import { isAdmin } from "@/lib/auth/admin";
import {
  cleanerAvailabilityCacheKey,
  getCleanerAvailabilityCached,
  setCleanerAvailabilityCached,
} from "@/lib/admin/cleanerAvailabilityCache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CleanerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  rating: number | null;
  jobs_completed: number | null;
  is_available: boolean | null;
  email?: string | null;
  status?: string | null;
  city_id?: string | null;
};

/**
 * Admin: cleaners available vs busy for a calendar slot (same overlap rules as booking create).
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
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const date = (searchParams.get("date") ?? "").trim();
  const timeRaw = (searchParams.get("time") ?? "").trim();
  const timeHm = normalizeTimeHm(timeRaw);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Query `date` must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(timeHm)) {
    return NextResponse.json({ error: "Query `time` must be a valid HH:MM slot." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const cacheKey = cleanerAvailabilityCacheKey(date, timeHm);
  const cached = getCleanerAvailabilityCached<{
    date: string;
    time: string;
    available: CleanerRow[];
    busy: (CleanerRow & { conflicting_booking_id: string })[];
  }>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const { data: cleanerRows, error: clErr } = await admin
    .from("cleaners")
    .select("id, full_name, phone, rating, jobs_completed, is_available, email, status, city_id")
    .eq("is_available", true)
    .order("full_name", { ascending: true });

  if (clErr) {
    return NextResponse.json({ error: clErr.message }, { status: 500 });
  }

  const cleaners = (cleanerRows ?? []) as CleanerRow[];

  const { data: bookingRows, error: bErr } = await admin
    .from("bookings")
    .select("id, cleaner_id, selected_cleaner_id")
    .eq("date", date)
    .eq("time", timeHm)
    .in("status", [...BOOKING_CLEANER_SLOT_OCCUPYING_STATUSES]);

  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }

  const busyByCleanerId = new Map<string, string>();
  for (const b of bookingRows ?? []) {
    const row = b as { id?: string; cleaner_id?: string | null; selected_cleaner_id?: string | null };
    const bid = typeof row.id === "string" ? row.id : "";
    if (!bid) continue;
    const c1 = typeof row.cleaner_id === "string" ? row.cleaner_id : null;
    const c2 = typeof row.selected_cleaner_id === "string" ? row.selected_cleaner_id : null;
    if (c1 && /^[0-9a-f-]{36}$/i.test(c1) && !busyByCleanerId.has(c1)) busyByCleanerId.set(c1, bid);
    if (c2 && /^[0-9a-f-]{36}$/i.test(c2) && !busyByCleanerId.has(c2)) busyByCleanerId.set(c2, bid);
  }

  const available: CleanerRow[] = [];
  const busy: (CleanerRow & { conflicting_booking_id: string })[] = [];
  for (const c of cleaners) {
    const conflict = busyByCleanerId.get(c.id);
    if (conflict) {
      busy.push({ ...c, conflicting_booking_id: conflict });
    } else {
      available.push(c);
    }
  }

  const payload = { date, time: timeHm, available, busy };
  setCleanerAvailabilityCached(cacheKey, payload);
  return NextResponse.json(payload);
}
