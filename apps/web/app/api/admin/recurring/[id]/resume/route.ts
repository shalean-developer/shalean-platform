import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate } from "@/lib/recurring/calculateNextRunDate";
import { scheduleFromMergedRow } from "@/lib/recurring/recurringPatchFromBody";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: row, error: loadErr } = await admin
    .from("recurring_bookings")
    .select("frequency, days_of_week, start_date, end_date, next_run_date, monthly_pattern, monthly_nth")
    .eq("id", id.trim())
    .maybeSingle();

  if (loadErr || !row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const schedule = scheduleFromMergedRow(row as Record<string, unknown>);
  const today = todayJohannesburg();
  const nextRun = calculateNextRunDate(schedule, today);

  const { error } = await admin
    .from("recurring_bookings")
    .update({ status: "active", next_run_date: nextRun })
    .eq("id", id.trim());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSystemEvent({
    level: "info",
    source: "admin/recurring/resume",
    message: "recurring_resumed",
    context: { recurring_id: id.trim(), admin_id: auth.user.id, next_run_date: nextRun },
  });

  return NextResponse.json({ ok: true, id: id.trim(), status: "active", next_run_date: nextRun });
}
