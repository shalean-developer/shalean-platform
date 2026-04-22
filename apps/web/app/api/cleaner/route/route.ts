import { NextResponse } from "next/server";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { buildCleanerSchedule } from "@/lib/dispatch/routeOptimization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const { data: cleaner } = await admin.from("cleaners").select("id").eq("id", session.cleanerId).maybeSingle();
  if (!cleaner) return NextResponse.json({ error: "Not a cleaner account." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? todayYmdJohannesburg();
  const schedule = await buildCleanerSchedule(admin, { cleanerId: session.cleanerId, date });

  return NextResponse.json({
    date,
    route: schedule,
  });
}
