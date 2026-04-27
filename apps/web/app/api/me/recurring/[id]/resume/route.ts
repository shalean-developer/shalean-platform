import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate } from "@/lib/recurring/calculateNextRunDate";
import { getRecurringRowForCustomer } from "@/lib/recurring/customerRecurringAccess";
import { scheduleFromMergedRow } from "@/lib/recurring/recurringPatchFromBody";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const row = await getRecurringRowForCustomer(admin, id.trim(), auth.session.userId);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const schedule = scheduleFromMergedRow(row);
  const nextRun = calculateNextRunDate(schedule, todayJohannesburg());

  const { error } = await admin
    .from("recurring_bookings")
    .update({ status: "active", next_run_date: nextRun })
    .eq("id", id.trim())
    .eq("customer_id", auth.session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSystemEvent({
    level: "info",
    source: "me/recurring/resume",
    message: "customer_recurring_resumed",
    context: { recurring_id: id.trim(), user_id: auth.session.userId, next_run_date: nextRun },
  });

  return NextResponse.json({ ok: true, id: id.trim(), status: "active", next_run_date: nextRun });
}
