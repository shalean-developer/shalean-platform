import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { buildCustomerRecurringPlanOptions } from "@/lib/recurring/customerRecurringPlanOptions";
import { loadUpcomingRecurringVisitsByPlanId } from "@/lib/recurring/loadRecurringBookingsForCustomer";
import { previewFromBookingTemplate } from "@/lib/recurring/previewFromBookingTemplate";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customer: list own recurring schedules (+ template preview and recent generated bookings per plan).
 */
export async function GET(request: Request) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const today = todayJohannesburg();

  const [{ data, error }, { data: configRow }] = await Promise.all([
    admin
      .from("recurring_bookings")
      .select(
        "id, address_id, frequency, days_of_week, start_date, end_date, price, status, next_run_date, last_generated_at, skip_next_occurrence_date, monthly_pattern, monthly_nth, created_at, updated_at, booking_snapshot_template",
      )
      .eq("customer_id", auth.session.userId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("pricing_booking_config").select("config").eq("id", "default").maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const ids = rows.map((r) => String((r as { id?: unknown }).id ?? "")).filter(Boolean);
  const byRecurring = await loadUpcomingRecurringVisitsByPlanId(admin, auth.session.userId, ids, today);

  const planOptions = buildCustomerRecurringPlanOptions(
    (configRow as { config?: unknown } | null)?.config ?? null,
  );

  const items = rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "");
    const template = row.booking_snapshot_template;
    const p = previewFromBookingTemplate(template);
    return {
      id,
      address_id: row.address_id != null ? String(row.address_id) : null,
      frequency: String(row.frequency ?? ""),
      days_of_week: Array.isArray(row.days_of_week) ? (row.days_of_week as number[]) : [],
      start_date: row.start_date != null ? String(row.start_date) : null,
      end_date: row.end_date != null ? String(row.end_date) : null,
      price: typeof row.price === "number" ? row.price : Number(row.price) || 0,
      status: String(row.status ?? ""),
      next_run_date: row.next_run_date != null ? String(row.next_run_date) : "",
      last_generated_at: row.last_generated_at != null ? String(row.last_generated_at) : null,
      skip_next_occurrence_date: row.skip_next_occurrence_date != null ? String(row.skip_next_occurrence_date) : null,
      monthly_pattern: String(row.monthly_pattern ?? ""),
      monthly_nth: row.monthly_nth != null ? Number(row.monthly_nth) : null,
      created_at: row.created_at != null ? String(row.created_at) : null,
      updated_at: row.updated_at != null ? String(row.updated_at) : null,
      template_visit_date: p.visitDate,
      template_visit_time: p.visitTime,
      template_location: p.location,
      template_service_label: p.serviceLabel,
      upcoming_bookings: byRecurring[id] ?? [],
    };
  });

  const activePlanCount = items.filter((i) => {
    const st = i.status.toLowerCase();
    return st === "active" || st === "paused";
  }).length;

  return NextResponse.json({ ok: true, items, planOptions, activePlanCount });
}
