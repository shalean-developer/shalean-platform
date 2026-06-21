import type { SupabaseClient } from "@supabase/supabase-js";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import type { BookingCustomerOwnershipColumn } from "@/lib/booking/bookingCustomerIdentity";
import { compareYmd } from "@/lib/recurring/johannesburgCalendar";

export const UPCOMING_VISITS_PER_PLAN = 12;

export type RecurringVisitRow = {
  id: string;
  recurring_id: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  location: string | null;
  payment_status: string | null;
  payment_completed_at: string | null;
  cleaner_response_status: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  dispatch_status: string | null;
  is_recurring_generated: boolean | null;
  billing_type: string | null;
  monthly_invoice_id: string | null;
};

async function resolveBookingOwnershipColumn(admin: SupabaseClient): Promise<BookingCustomerOwnershipColumn> {
  const probe = await admin.from("bookings").select("customer_id").limit(1);
  if (probe.error && isUnknownColumnError(probe.error, "customer_id")) {
    return "user_id";
  }
  return "customer_id";
}

export async function loadUpcomingRecurringVisitsByPlanId(
  admin: SupabaseClient,
  customerId: string,
  recurringIds: string[],
  todayYmd: string,
): Promise<Record<string, RecurringVisitRow[]>> {
  const byRecurring: Record<string, RecurringVisitRow[]> = {};
  if (recurringIds.length === 0) return byRecurring;

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const { data: bRows, error: bErr } = await admin
    .from("bookings")
    .select(
      "id, recurring_id, date, time, status, location, payment_status, payment_completed_at, cleaner_response_status, en_route_at, started_at, completed_at, dispatch_status, is_recurring_generated, billing_type, monthly_invoice_id",
    )
    .eq(ownershipColumn, customerId)
    .in("recurring_id", recurringIds)
    .order("date", { ascending: true })
    .limit(400);

  if (bErr || !Array.isArray(bRows)) return byRecurring;

  const acc: Record<string, RecurringVisitRow[]> = {};
  for (const br of bRows as Record<string, unknown>[]) {
    const rid = br.recurring_id != null ? String(br.recurring_id) : "";
    if (!rid) continue;
    const dateStr = br.date != null ? String(br.date) : null;
    if (dateStr && compareYmd(dateStr, todayYmd) < 0) continue;
    const row: RecurringVisitRow = {
      id: String(br.id ?? ""),
      recurring_id: rid,
      date: dateStr,
      time: br.time != null ? String(br.time) : null,
      status: br.status != null ? String(br.status) : null,
      location: br.location != null ? String(br.location) : null,
      payment_status: br.payment_status != null ? String(br.payment_status) : null,
      payment_completed_at:
        br.payment_completed_at != null && String(br.payment_completed_at).trim()
          ? String(br.payment_completed_at)
          : null,
      cleaner_response_status: br.cleaner_response_status != null ? String(br.cleaner_response_status) : null,
      en_route_at: br.en_route_at != null ? String(br.en_route_at) : null,
      started_at: br.started_at != null ? String(br.started_at) : null,
      completed_at: br.completed_at != null ? String(br.completed_at) : null,
      dispatch_status: br.dispatch_status != null ? String(br.dispatch_status) : null,
      is_recurring_generated:
        br.is_recurring_generated === true || br.is_recurring_generated === false
          ? br.is_recurring_generated
          : null,
      billing_type: br.billing_type != null ? String(br.billing_type) : null,
      monthly_invoice_id: br.monthly_invoice_id != null ? String(br.monthly_invoice_id) : null,
    };
    if (!acc[rid]) acc[rid] = [];
    acc[rid].push(row);
  }

  for (const rid of Object.keys(acc)) {
    acc[rid].sort((a, b) => compareYmd(a.date ?? "", b.date ?? ""));
    byRecurring[rid] = acc[rid].slice(0, UPCOMING_VISITS_PER_PLAN);
  }

  return byRecurring;
}
