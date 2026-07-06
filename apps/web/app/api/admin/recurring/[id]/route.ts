import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate } from "@/lib/recurring/calculateNextRunDate";
import { previewFromBookingTemplate } from "@/lib/recurring/previewFromBookingTemplate";
import { recurringAdminPatchFromBody } from "@/lib/recurring/recurringAdminPatchFromBody";
import { parsePreferredCleanerIdsFromBody } from "@/lib/recurring/parsePreferredCleanerIdFromBody";
import { propagateRecurringPlanToGeneratedBookings } from "@/lib/recurring/propagateRecurringPlanToGeneratedBookings";
import {
  recurringPlanScheduleChanged,
  recurringPlanScheduleRowFromDb,
} from "@/lib/recurring/reconcileRecurringPlanOccurrences";
import { scheduleFromMergedRow } from "@/lib/recurring/recurringPatchFromBody";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapRecurringRow(raw: Record<string, unknown>) {
  const template = raw.booking_snapshot_template;
  const p = previewFromBookingTemplate(template);
  return {
    id: String(raw.id ?? ""),
    customer_id: String(raw.customer_id ?? ""),
    address_id: raw.address_id != null ? String(raw.address_id) : null,
    frequency: String(raw.frequency ?? ""),
    days_of_week: Array.isArray(raw.days_of_week) ? (raw.days_of_week as number[]) : [],
    start_date: raw.start_date != null ? String(raw.start_date) : null,
    end_date: raw.end_date != null ? String(raw.end_date) : null,
    price: typeof raw.price === "number" ? raw.price : Number(raw.price) || 0,
    status: String(raw.status ?? ""),
    next_run_date: raw.next_run_date != null ? String(raw.next_run_date) : "",
    last_generated_at: raw.last_generated_at != null ? String(raw.last_generated_at) : null,
    skip_next_occurrence_date: raw.skip_next_occurrence_date != null ? String(raw.skip_next_occurrence_date) : null,
    monthly_pattern: String(raw.monthly_pattern ?? ""),
    monthly_nth: raw.monthly_nth != null ? Number(raw.monthly_nth) : null,
    preferred_cleaner_id: raw.preferred_cleaner_id != null ? String(raw.preferred_cleaner_id) : null,
    created_at: raw.created_at != null ? String(raw.created_at) : null,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    customer_email: p.customerEmail,
    customer_name: p.customerName,
    service_label: p.serviceLabel,
    template_visit_date: p.visitDate,
    template_visit_time: p.visitTime,
    template_location: p.location,
  };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(_request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("recurring_bookings")
    .select(
      "id, customer_id, address_id, frequency, days_of_week, start_date, end_date, price, status, next_run_date, last_generated_at, skip_next_occurrence_date, monthly_pattern, monthly_nth, preferred_cleaner_id, created_at, updated_at, booking_snapshot_template",
    )
    .eq("id", id.trim())
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ plan: mapRecurringRow(data as Record<string, unknown>) });
}

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

  const patch = recurringAdminPatchFromBody(body, existing as Record<string, unknown>);

  const preferredCleanerIdsParse = await parsePreferredCleanerIdsFromBody(body, admin);
  if (!preferredCleanerIdsParse.ok) {
    return NextResponse.json({ error: preferredCleanerIdsParse.error }, { status: 400 });
  }
  if (preferredCleanerIdsParse.ids.length > 0 || "preferred_cleaner_id" in body || "preferred_cleaner_ids" in body) {
    patch.preferred_cleaner_id = preferredCleanerIdsParse.ids[0] ?? null;
    const tpl = patch.booking_snapshot_template ?? existing.booking_snapshot_template;
    if (tpl && typeof tpl === "object" && !Array.isArray(tpl)) {
      patch.booking_snapshot_template = {
        ...(tpl as Record<string, unknown>),
        selectedCleanerIds: preferredCleanerIdsParse.ids,
      };
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const merged = { ...existing, ...patch } as Record<string, unknown>;
  const schedule = scheduleFromMergedRow(merged);
  const today = todayJohannesburg();
  patch.next_run_date = calculateNextRunDate(schedule, today);

  const { error } = await admin.from("recurring_bookings").update(patch).eq("id", id.trim());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const propagation = await propagateRecurringPlanToGeneratedBookings(
    admin,
    recurringPlanScheduleRowFromDb(merged),
    { reconcileSchedule: recurringPlanScheduleChanged(patch) },
  );

  await logSystemEvent({
    level: "info",
    source: "admin/recurring/patch",
    message: "recurring_schedule_updated",
    context: {
      recurring_id: id.trim(),
      admin_id: auth.user.id,
      fields: Object.keys(patch),
      propagation,
    },
  });

  return NextResponse.json({ ok: true, id: id.trim(), ...patch, propagation });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(_request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const planId = id.trim();
  const { data: existing, error: exErr } = await admin
    .from("recurring_bookings")
    .select("id, status")
    .eq("id", planId)
    .maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { error } = await admin.from("recurring_bookings").delete().eq("id", planId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSystemEvent({
    level: "info",
    source: "admin/recurring/delete",
    message: "recurring_deleted",
    context: { recurring_id: planId, admin_id: auth.user.id, prior_status: existing.status },
  });

  return NextResponse.json({ ok: true, id: planId });
}
