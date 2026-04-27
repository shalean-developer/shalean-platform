import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate } from "@/lib/recurring/calculateNextRunDate";
import { getRecurringRowForCustomer } from "@/lib/recurring/customerRecurringAccess";
import { recurringPatchFieldsFromBody, scheduleFromMergedRow } from "@/lib/recurring/recurringPatchFromBody";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customer: reschedule / update own recurring (same field allowlist as admin PATCH).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerSession(request);
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

  const existing = await getRecurringRowForCustomer(admin, id.trim(), auth.session.userId);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const patch = recurringPatchFieldsFromBody(body);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const merged = { ...existing, ...patch } as Record<string, unknown>;
  const schedule = scheduleFromMergedRow(merged);
  const today = todayJohannesburg();
  patch.next_run_date = calculateNextRunDate(schedule, today);

  const { error } = await admin
    .from("recurring_bookings")
    .update(patch)
    .eq("id", id.trim())
    .eq("customer_id", auth.session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSystemEvent({
    level: "info",
    source: "me/recurring/patch",
    message: "customer_recurring_schedule_updated",
    context: { recurring_id: id.trim(), user_id: auth.session.userId, fields: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true, id: id.trim(), ...patch });
}
