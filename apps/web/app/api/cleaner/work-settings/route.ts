import { NextResponse } from "next/server";
import { fetchCleanerMeRow } from "@/lib/cleaner/cleanerMeDb";
import { parseCleanerAvailabilityWeekdaysStrict } from "@/lib/cleaner/availabilityWeekdays";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status, headers: { "Cache-Control": "no-store" } });
  }

  const cleanerId = session.cleaner.id;
  const { data: me, error: meErr } = await fetchCleanerMeRow(admin, cleanerId);
  if (meErr || !me) {
    return NextResponse.json({ error: meErr?.message ?? "Could not load cleaner." }, { status: 500 });
  }

  const location = String(me.location ?? "").trim();
  const working_days = parseCleanerAvailabilityWeekdaysStrict(me.availability_weekdays);

  const { data: lastRows, error: reqErr } = await admin
    .from("cleaner_change_requests")
    .select("id, status, created_at")
    .eq("cleaner_id", cleanerId)
    .order("created_at", { ascending: false })
    .limit(1);

  /** Never fail the whole payload if history table is missing or misconfigured — area + days still matter. */
  const last =
    !reqErr && Array.isArray(lastRows) && lastRows[0]
      ? (() => {
          const row = lastRows[0] as { id: string; status: string; created_at: string };
          return {
            id: String(row.id),
            status: String(row.status),
            created_at: String(row.created_at),
          };
        })()
      : null;

  return NextResponse.json(
    {
      assigned_area: location || null,
      working_days,
      last_request: last,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
