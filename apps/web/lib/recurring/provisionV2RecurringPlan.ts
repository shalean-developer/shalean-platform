import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { calculateNextRunDate } from "@/lib/recurring/calculateNextRunDate";

/**
 * Day-name → ISO weekday integer (Mon=1 … Sun=7).
 * Accepts any case / abbreviation prefix of 3+ chars.
 */
const DAY_NAME_TO_INT: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function parseDayName(name: string): number | null {
  const key = name.toLowerCase().slice(0, 3);
  for (const [full, n] of Object.entries(DAY_NAME_TO_INT)) {
    if (full.startsWith(key)) return n;
  }
  return null;
}

/**
 * Maps booking-v2 frequency vocabulary to the `recurring_bookings.frequency` CHECK constraint:
 * `weekly | biweekly | monthly`.
 */
function mapFrequency(raw: string): "weekly" | "biweekly" | "monthly" | null {
  const f = raw.toLowerCase().trim();
  if (f === "weekly") return "weekly";
  if (f === "fortnightly" || f === "biweekly") return "biweekly";
  if (f === "monthly") return "monthly";
  return null;
}

export type ProvisionV2RecurringPlanParams = {
  bookingId: string;
  customerId: string;
  recurringFrequency: string;
  /** Day names like ["Monday", "Wednesday"] */
  recurringDays: string[];
  startDate: string;
  endDate?: string | null;
  totalPaidZar: number;
  durationMinutes: number;
  /** booking.service (e.g. "regular-cleaning") */
  service: string;
  time: string;
  location: string;
  suburb: string;
  rooms: number;
  bathrooms: number;
  preferredCleanerIds?: readonly string[];
};

export type ProvisionV2RecurringPlanResult =
  | { ok: true; planId: string; alreadyExists?: true }
  | { ok: false; error: string };

async function linkSourceBookingToPlan(
  admin: SupabaseClient,
  bookingId: string,
  customerId: string,
  planId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("bookings")
    .update({ recurring_id: planId })
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "source_booking_not_found" };
  return { ok: true };
}

/**
 * Creates a `recurring_bookings` plan row from a paid booking-v2 recurring booking.
 *
 * The paid checkout booking is the first occurrence of the plan. It must be linked
 * to `bookings.recurring_id` immediately so the recurring generator sees that
 * start-date occurrence as already present and does not create a second unpaid row.
 */
export async function provisionV2RecurringPlan(
  admin: SupabaseClient,
  params: ProvisionV2RecurringPlanParams,
): Promise<ProvisionV2RecurringPlanResult> {
  const { bookingId, customerId, recurringFrequency, recurringDays, startDate } = params;

  const frequency = mapFrequency(recurringFrequency);
  if (!frequency) {
    return { ok: false, error: `unsupported_frequency:${recurringFrequency}` };
  }

  const daysOfWeek = recurringDays
    .map(parseDayName)
    .filter((n): n is number => n !== null);

  if (daysOfWeek.length === 0) {
    const dow = new Date(`${startDate}T12:00:00Z`).getUTCDay();
    daysOfWeek.push(dow === 0 ? 7 : dow);
  }

  // True idempotency source: the paid booking itself already points at a recurring plan.
  const { data: sourceBooking, error: sourceBookingErr } = await admin
    .from("bookings")
    .select("recurring_id")
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (sourceBookingErr) {
    return { ok: false, error: `source_booking_lookup_failed:${sourceBookingErr.message}` };
  }

  const existingPlanId =
    sourceBooking && typeof (sourceBooking as { recurring_id?: string | null }).recurring_id === "string"
      ? (sourceBooking as { recurring_id: string }).recurring_id
      : null;

  if (existingPlanId) {
    return { ok: true, planId: existingPlanId, alreadyExists: true };
  }

  // Guard retries/races where a matching plan exists but the source booking was not linked yet.
  const { data: dupPlan, error: dupPlanErr } = await admin
    .from("recurring_bookings")
    .select("id")
    .eq("customer_id", customerId)
    .eq("start_date", startDate)
    .eq("frequency", frequency)
    .maybeSingle();

  if (dupPlanErr) {
    return { ok: false, error: `recurring_plan_lookup_failed:${dupPlanErr.message}` };
  }

  if (dupPlan && typeof (dupPlan as { id?: string }).id === "string") {
    const planId = (dupPlan as { id: string }).id;
    const linked = await linkSourceBookingToPlan(admin, bookingId, customerId, planId);
    if (!linked.ok) return { ok: false, error: `source_booking_link_failed:${linked.error}` };
    return { ok: true, planId, alreadyExists: true };
  }

  const durationHours = Math.max(1, Math.round((params.durationMinutes / 60) * 10) / 10);
  const monthlyPattern = "mirror_start_date" as const;
  const nextRun = calculateNextRunDate(
    {
      frequency,
      days_of_week: daysOfWeek,
      start_date: startDate,
      end_date: params.endDate ?? null,
      monthly_pattern: monthlyPattern,
      monthly_nth: null,
    },
    startDate,
  );

  const bookingSnapshotTemplate = {
    v: 1,
    locked: {
      locked: true as const,
      lockedAt: new Date().toISOString(),
      service: params.service,
      location: params.location,
      suburb: params.suburb,
      date: startDate,
      time: params.time,
      rooms: params.rooms,
      bathrooms: params.bathrooms,
      extras: [],
      finalPrice: params.totalPaidZar,
      finalHours: durationHours,
      surge: 1,
      price: params.totalPaidZar,
      duration: durationHours,
    },
    customer: {
      email: "",
    },
    total_zar: params.totalPaidZar,
    ...(params.preferredCleanerIds && params.preferredCleanerIds.length > 0
      ? { selectedCleanerIds: [...params.preferredCleanerIds] }
      : {}),
  };

  const { data: plan, error: insertErr } = await admin
    .from("recurring_bookings")
    .insert({
      customer_id: customerId,
      frequency,
      days_of_week: daysOfWeek,
      start_date: startDate,
      end_date: params.endDate ?? null,
      price: params.totalPaidZar,
      status: "active",
      next_run_date: nextRun,
      booking_snapshot_template: bookingSnapshotTemplate,
      monthly_pattern: monthlyPattern,
      ...(params.preferredCleanerIds?.[0] ? { preferred_cleaner_id: params.preferredCleanerIds[0] } : {}),
    })
    .select("id")
    .single();

  if (insertErr || !plan) {
    return { ok: false, error: insertErr?.message ?? "insert_failed" };
  }

  const planId = (plan as { id: string }).id;
  const linked = await linkSourceBookingToPlan(admin, bookingId, customerId, planId);
  if (!linked.ok) {
    // Prevent an orphan active plan from generating a duplicate first occurrence.
    await admin.from("recurring_bookings").delete().eq("id", planId);
    return { ok: false, error: `source_booking_link_failed:${linked.error}` };
  }

  await logSystemEvent({
    level: "info",
    source: "recurring/provision",
    message: "recurring_plan_provisioned_from_v2_booking",
    context: {
      planId,
      bookingId,
      customerId,
      frequency,
      daysOfWeek,
      startDate,
      nextRun,
      firstOccurrenceLinked: true,
    },
  });

  return { ok: true, planId };
}
