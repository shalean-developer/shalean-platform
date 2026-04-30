import { NextResponse } from "next/server";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_TRACK_SELECT =
  "id, cleaner_id, team_id, is_team_job, payout_owner_cleaner_id, cleaner_response_status";

function parseCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const auth = await resolveCleanerFromRequest(request, admin);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const cleanerId = auth.cleaner.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;
  const bookingId = typeof rec.bookingId === "string" ? rec.bookingId.trim() : "";
  const lat = parseCoord(rec.lat);
  const lng = parseCoord(rec.lng);
  const heading = rec.heading === undefined || rec.heading === null ? null : parseCoord(rec.heading);
  const speed = rec.speed === undefined || rec.speed === null ? null : parseCoord(rec.speed);

  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
  }
  if (lat == null || lng == null) {
    return NextResponse.json({ error: "lat and lng must be finite numbers." }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "lat/lng out of range." }, { status: 400 });
  }

  const { data: row, error: fetchErr } = await admin
    .from("bookings")
    .select(BOOKING_TRACK_SELECT)
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const b = row as Record<string, unknown>;
  const canAccess = await cleanerHasBookingAccess(admin, cleanerId, {
    cleaner_id: (b.cleaner_id as string | null | undefined) ?? null,
    payout_owner_cleaner_id: (b.payout_owner_cleaner_id as string | null | undefined) ?? null,
    team_id: (b.team_id as string | null | undefined) ?? null,
    is_team_job: b.is_team_job === true,
  });
  if (!canAccess) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const crs = String(b.cleaner_response_status ?? "")
    .trim()
    .toLowerCase();
  if (crs !== CLEANER_RESPONSE.ON_MY_WAY) {
    return NextResponse.json(
      { error: "Location updates are only accepted while you are on the way to this job." },
      { status: 403 },
    );
  }

  const insertRow: Record<string, unknown> = {
    cleaner_id: cleanerId,
    booking_id: bookingId,
    lat,
    lng,
  };
  if (heading != null) insertRow.heading = heading;
  if (speed != null) insertRow.speed = speed;

  const { error: insErr } = await admin.from("cleaner_booking_track_points").insert(insertRow);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
