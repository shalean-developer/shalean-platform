import { NextResponse } from "next/server";
import { loadDispatchTeamsForBooking } from "@/lib/dispatch/loadDispatchTeamsForBooking";
import { MAX_TEAM_BOOKINGS_PER_DAY, TEAM_SERVICES } from "@/src/features/booking-v2/config/serviceConfig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

  const { teams, platformAtCapacity, error } = await loadDispatchTeamsForBooking(supabase, {
    dateYmd: date,
    serviceSlug: service,
  });
  if (error) {
    console.error("[booking-v2/team-availability]", error);
    return NextResponse.json({ error: "Could not check availability." }, { status: 500 });
  }

  const totalBooked = teams.filter((t) => !t.available).length;
  const availableTeams = teams.filter((t) => t.available);
  const available = !platformAtCapacity && availableTeams.length > 0;

  return NextResponse.json({
    available,
    totalBooked,
    maxSlots: MAX_TEAM_BOOKINGS_PER_DAY,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      available: team.available,
      active_member_count: team.active_member_count,
      qualified_member_count: team.qualified_member_count,
    })),
  });
}
