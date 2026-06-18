import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

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

/**
 * Returns the next occurrence date after `startYmd` for the given frequency.
 * Format: "YYYY-MM-DD".
 */
function nextRunDate(startYmd: string, freq: "weekly" | "biweekly" | "monthly"): string {
  const d = new Date(`${startYmd}T12:00:00Z`);
  if (freq === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (freq === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
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
};

export type ProvisionV2RecurringPlanResult =
  | { ok: true; planId: string; alreadyExists?: true }
  | { ok: false; error: string };

/**
 * Creates a `recurring_bookings` plan row from a paid booking-v2 recurring booking.
 * Idempotent: if a plan for this booking already exists (via `source_booking_id`) it returns ok.
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

  // Map day names to int[]
  const daysOfWeek = recurringDays
    .map(parseDayName)
    .filter((n): n is number => n !== null);

  // Fall back to the weekday of startDate if no days provided
  if (daysOfWeek.length === 0) {
    const dow = new Date(`${startDate}T12:00:00Z`).getUTCDay();
    // ISO weekday: 0=Sun → 7, 1=Mon → 1, …
    daysOfWeek.push(dow === 0 ? 7 : dow);
  }

  // Idempotency: check if we already provisioned a plan from this booking
  const { data: existing } = await admin
    .from("recurring_bookings")
    .select("id")
    .eq("customer_id", customerId)
    .eq("source_booking_id" as string, bookingId)
    .maybeSingle();

  if (existing && typeof (existing as { id?: string }).id === "string") {
    return { ok: true, planId: (existing as { id: string }).id, alreadyExists: true };
  }

  // Also guard: same customer + startDate + service + frequency already has a plan
  const { data: dupPlan } = await admin
    .from("recurring_bookings")
    .select("id")
    .eq("customer_id", customerId)
    .eq("start_date", startDate)
    .eq("frequency", frequency)
    .maybeSingle();

  if (dupPlan && typeof (dupPlan as { id?: string }).id === "string") {
    return { ok: true, planId: (dupPlan as { id: string }).id, alreadyExists: true };
  }

  const durationHours = Math.max(1, Math.round((params.durationMinutes / 60) * 10) / 10);
  const nextRun = nextRunDate(startDate, frequency);

  // Build a minimal BookingSnapshotV1-compatible template (locked sub-object).
  // parseLockedBookingFromUnknown requires: locked=true, finalPrice, finalHours,
  // time, lockedAt, rooms, bathrooms, extras, date.
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
      monthly_pattern: "mirror_start_date",
    })
    .select("id")
    .single();

  if (insertErr || !plan) {
    return { ok: false, error: insertErr?.message ?? "insert_failed" };
  }

  await logSystemEvent({
    level: "info",
    source: "recurring/provision",
    message: "recurring_plan_provisioned_from_v2_booking",
    context: {
      planId: (plan as { id: string }).id,
      bookingId,
      customerId,
      frequency,
      daysOfWeek,
      startDate,
      nextRun,
    },
  });

  return { ok: true, planId: (plan as { id: string }).id };
}
