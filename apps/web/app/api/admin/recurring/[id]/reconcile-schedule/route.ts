import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { propagateRecurringPlanToGeneratedBookings } from "@/lib/recurring/propagateRecurringPlanToGeneratedBookings";
import { recurringPlanScheduleRowFromDb } from "@/lib/recurring/reconcileRecurringPlanOccurrences";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: align generated visits with the plan schedule (remove extras, add missing),
 * reprice rows, and recompute draft invoices + cleaner payouts.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: plan, error: loadErr } = await admin
    .from("recurring_bookings")
    .select("*")
    .eq("id", id.trim())
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const status = String((plan as { status?: string }).status ?? "").toLowerCase();
  if (status === "cancelled") {
    return NextResponse.json({ error: "Cannot reconcile a cancelled plan." }, { status: 400 });
  }

  const propagation = await propagateRecurringPlanToGeneratedBookings(
    admin,
    recurringPlanScheduleRowFromDb(plan as Record<string, unknown>),
    { reconcileSchedule: true },
  );

  await logSystemEvent({
    level: "info",
    source: "admin/recurring/reconcile-schedule",
    message: "recurring_schedule_reconciled",
    context: {
      recurring_id: id.trim(),
      admin_id: auth.user.id,
      propagation,
    },
  });

  return NextResponse.json({ ok: true, id: id.trim(), propagation });
}
