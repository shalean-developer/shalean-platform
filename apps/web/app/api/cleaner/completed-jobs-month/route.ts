import { NextResponse } from "next/server";
import { fetchCleanerVisibleBookingsMerged } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function johannesburgMonthRange(now = new Date()): { from: string; to: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const monthNumber = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
  const from = `${month}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const to = next.toISOString().slice(0, 10);
  return { from, to, month };
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const { from, to, month } = johannesburgMonthRange();
  const { data, error } = await fetchCleanerVisibleBookingsMerged(admin, session.cleanerId, {
    select: "id, date, status",
    perBranchLimit: 500,
    applyEachBranch: (query) =>
      query.eq("status", "completed").gte("date", from).lt("date", to),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const uniqueBookingIds = new Set(
    (data ?? [])
      .map((row) => String((row as { id?: unknown }).id ?? "").trim())
      .filter(Boolean),
  );

  return NextResponse.json({ completed_jobs: uniqueBookingIds.size, month });
}
