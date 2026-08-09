import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadCleanerPerformanceScorecards } from "@/lib/workforce/cleanerPerformanceScorecards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get("days") ?? "90");
  const days = Number.isFinite(rawDays) ? Math.max(30, Math.min(365, Math.round(rawDays))) : 90;

  try {
    const result = await loadCleanerPerformanceScorecards(admin, { cleanerId: session.cleanerId, days });
    const scorecard = result.scorecards[0] ?? null;
    if (!scorecard) return NextResponse.json({ error: "Cleaner performance profile not found." }, { status: 404 });
    return NextResponse.json({ scorecard, from: result.from, to: result.to, meta: { days } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load performance." }, { status: 500 });
  }
}
