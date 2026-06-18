import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TEAMS, TEAM_SERVICES, MAX_TEAM_BOOKINGS_PER_DAY } from "@/src/features/booking-v2/config/serviceConfig";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const service = searchParams.get("service");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid or missing date parameter." }, { status: 400 });
  }

  if (!service || !TEAM_SERVICES.includes(service as (typeof TEAM_SERVICES)[number])) {
    return NextResponse.json({ error: "Service must be deep-cleaning or moving-cleaning." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // Count bookings per assigned_team_id for both deep and moving on the given date
  const { data, error } = await supabase
    .from("bookings")
    .select("assigned_team_id")
    .eq("date", date)
    .in("service", ["deep-cleaning", "moving-cleaning"])
    .not("status", "in", '("cancelled","refunded")');

  if (error) {
    console.error("[booking-v2/team-availability]", error.message);
    return NextResponse.json({ error: "Could not check availability." }, { status: 500 });
  }

  // Count bookings per team
  const bookingsByTeam: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.assigned_team_id) {
      bookingsByTeam[row.assigned_team_id] = (bookingsByTeam[row.assigned_team_id] ?? 0) + 1;
    }
  }

  const totalBooked = (data ?? []).length;
  const available = totalBooked < MAX_TEAM_BOOKINGS_PER_DAY;

  const teams = TEAMS.map((team) => ({
    id: team.id,
    name: team.name,
    // A team is available if it has no booking on this date
    available: (bookingsByTeam[team.id] ?? 0) === 0,
  }));

  return NextResponse.json({
    available,
    totalBooked,
    maxSlots: MAX_TEAM_BOOKINGS_PER_DAY,
    teams,
  });
}
