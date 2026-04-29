import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import {
  computeAssignEligibility,
  countBookingsOverlappingDemandSlot,
  effectiveJobDurationMinutes,
  formatMinutesAsHm,
} from "@/lib/admin/adminAssignEligibility";
import { hmToMinutes } from "@/lib/dispatch/timeWindow";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

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

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get("cleanerIds")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, time, duration_minutes, city_id, location_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const b = booking as {
    date?: string | null;
    time?: string | null;
    duration_minutes?: number | null;
    city_id?: string | null;
    location_id?: string | null;
  };
  const dateYmd = String(b.date ?? "").trim();
  const timeHm = String(b.time ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^\d{2}:\d{2}/.test(timeHm)) {
    return NextResponse.json({ error: "Booking has no valid date/time for slot checks." }, { status: 400 });
  }

  const durationMinutes = effectiveJobDurationMinutes(b);
  const slotStartMin = hmToMinutes(timeHm.slice(0, 5));
  const cityIdFilter = b.city_id?.trim() ? String(b.city_id).trim() : null;
  const overlappingDemandInSlot =
    slotStartMin != null
      ? await countBookingsOverlappingDemandSlot(admin, {
          dateYmd,
          cityId: cityIdFilter,
          slotStartMin,
          slotDurationMin: durationMinutes,
        })
      : 0;

  let cleanerIds = rawIds.slice(0, 150);
  if (cleanerIds.length === 0) {
    let q = admin.from("cleaners").select("id").order("full_name", { ascending: true }).limit(200);
    const cityId = b.city_id?.trim();
    if (cityId) q = q.eq("city_id", cityId);
    const { data: rows } = await q;
    cleanerIds = (rows ?? []).map((r) => String((r as { id: string }).id));
  }

  const map = await computeAssignEligibility(admin, {
    bookingId,
    bookingDateYmd: dateYmd,
    bookingTimeHm: timeHm.slice(0, 5),
    durationMinutes,
    cleanerIds,
    bookingLocationId: b.location_id?.trim() ? String(b.location_id).trim() : null,
  });

  const eligibility: Record<
    string,
    {
      slotCalendarOk: boolean;
      overlapBlocked: boolean;
      busyUntilLabel: string | null;
      overlapExplain: string | null;
      nextAvailableHm: string | null;
      offline: boolean;
      canAssignWithoutForce: boolean;
    }
  > = {};

  for (const [id, row] of map) {
    const overlapExplain =
      row.overlapBlocked && row.busyUntilMin != null && row.overlapJobRangeLabel
        ? `Busy until ${formatMinutesAsHm(row.busyUntilMin)} (overlaps with ${row.overlapJobRangeLabel} job)`
        : row.overlapBlocked && row.busyUntilMin != null
          ? `Busy until ${formatMinutesAsHm(row.busyUntilMin)} (overlap)`
          : null;
    eligibility[id] = {
      slotCalendarOk: row.slotCalendarOk,
      overlapBlocked: row.overlapBlocked,
      busyUntilLabel: row.busyUntilMin != null ? formatMinutesAsHm(row.busyUntilMin) : null,
      overlapExplain,
      nextAvailableHm: row.nextAvailableStartHm,
      offline: row.offline,
      canAssignWithoutForce: row.canAssignWithoutForce,
    };
  }

  return NextResponse.json({
    booking: { date: dateYmd, time: timeHm.slice(0, 5), durationMinutes },
    overlappingDemandInSlot,
    eligibility,
  });
}
