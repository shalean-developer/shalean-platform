import { NextResponse } from "next/server";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { earningsMonth } from "@/lib/cleaner/earningsWorkspaceContract";
import { fetchEarningsWorkspace } from "@/lib/cleaner/fetchEarningsWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin)
    return NextResponse.json(
      { error: "Earnings are temporarily unavailable." },
      { status: 503, headers },
    );
  const auth = await resolveCleanerFromRequest(request, admin);
  if (!auth.ok)
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers },
    );
  const requested = new URL(request.url).searchParams.get("month");
  if (requested != null && !earningsMonth(requested)) {
    return NextResponse.json(
      { error: "Choose a valid month." },
      { status: 400, headers },
    );
  }
  const now = new Date();
  const month = requested ?? johannesburgCalendarYmd(now).slice(0, 7);
  try {
    // Identity is obtained only from the verified session, never a URL/header cleaner id.
    const data = await fetchEarningsWorkspace(
      admin,
      auth.cleaner.id,
      month,
      now,
    );
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json(
      { error: "Your earnings could not be loaded. Please try again." },
      { status: 503, headers },
    );
  }
}
