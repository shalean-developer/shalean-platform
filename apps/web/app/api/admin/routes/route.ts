import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { buildCleanerSchedule } from "@/lib/dispatch/routeOptimization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? todayYmdJohannesburg();
  const cityId = searchParams.get("cityId");

  let cleanersQuery = admin
    .from("cleaners")
    .select("id, full_name, is_available, status")
    .order("full_name", { ascending: true })
    .limit(200);
  if (cityId) cleanersQuery = cleanersQuery.eq("city_id", cityId);
  const { data: cleaners, error } = await cleanersQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const schedules = await Promise.all(
    (cleaners ?? []).map(async (cleaner) => {
      const schedule = await buildCleanerSchedule(admin, { cleanerId: cleaner.id, date });
      return {
        cleaner: {
          id: cleaner.id,
          fullName: cleaner.full_name,
          isAvailable: cleaner.is_available,
          status: cleaner.status,
        },
        schedule,
      };
    }),
  );

  const totalTravelTimeSavedMinutes = schedules.reduce((sum, s) => sum + s.schedule.metrics.travelTimeSavedMinutes, 0);
  const jobsPerCleanerPerDay =
    schedules.length > 0
      ? Math.round((schedules.reduce((sum, s) => sum + s.schedule.metrics.jobsCount, 0) / schedules.length) * 10) / 10
      : 0;

  return NextResponse.json({
    date,
    cityId: cityId || null,
    routes: schedules,
    metrics: {
      travelTimeSavedMinutes: totalTravelTimeSavedMinutes,
      jobsPerCleanerPerDay,
    },
  });
}
