import { NextResponse } from "next/server";
import { fetchCleanerVisibleBookingsMerged } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getJhbTodayRange } from "@/lib/dashboard/johannesburgMonth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json(
      { error: session.error ?? "Unauthorized." },
      { status: session.status ?? 401 },
    );
  }

  const { todayYmd } = getJhbTodayRange(new Date());
  const monthPrefix = todayYmd.slice(0, 7);

  const { data, error } = await fetchCleanerVisibleBookingsMerged(admin, session.cleanerId, {
    select: "id, date, status",
    perBranchLimit: 500,
    applyEachBranch: (query) =>
      query
        .eq("status", "completed")
        .gte("date", `${monthPrefix}-01`)
        .lte("date", `${monthPrefix}-31`),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const uniqueBookingIds = new Set(
    (data ?? [])
      .filter((row) => String(row.status ?? "").toLowerCase() === "completed")
      .filter((row) => String(row.date ?? "").slice(0, 7) === monthPrefix)
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean),
  );

  return NextResponse.json(
    { completed_jobs_month: uniqueBookingIds.size, month: monthPrefix },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
