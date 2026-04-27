import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate } from "@/lib/recurring/calculateNextRunDate";
import { recurringPatchFieldsFromBody, scheduleFromMergedRow } from "@/lib/recurring/recurringPatchFromBody";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `PATCH` — change schedule / price / template. Recomputes `next_run_date` from today when schedule fields change.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: existing, error: exErr } = await admin.from("recurring_bookings").select("*").eq("id", id.trim()).maybeSingle();
  if (exErr || !existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const patch = recurringPatchFieldsFromBody(body);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const merged = { ...existing, ...patch } as Record<string, unknown>;
  const schedule = scheduleFromMergedRow(merged);
  const today = todayJohannesburg();
  patch.next_run_date = calculateNextRunDate(schedule, today);

  const { error } = await admin.from("recurring_bookings").update(patch).eq("id", id.trim());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSystemEvent({
    level: "info",
    source: "admin/recurring/patch",
    message: "recurring_schedule_updated",
    context: { recurring_id: id.trim(), admin_id: auth.user.id, fields: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true, id: id.trim(), ...patch });
}
