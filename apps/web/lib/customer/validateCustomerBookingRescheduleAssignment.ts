import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCustomerBookingRowForUser } from "@/lib/customer/customerBookingsForUser";
import { findCleanerSlotOccupancyConflict } from "@/lib/booking/cleanerSlotEligibility";
import { resolveSchedulingDurationMinutes } from "@/lib/booking/quote/bookingQuotePersistence";

export type CustomerRescheduleAssignmentValidation =
  | { ok: true }
  | { ok: false; status: number; error: string };

function hmToMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export async function validateCustomerBookingRescheduleAssignment(
  admin: SupabaseClient,
  params: {
    userId: string;
    viewerEmail: string | null;
    bookingId: string;
    date: string;
    time: string;
  },
): Promise<CustomerRescheduleAssignmentValidation> {
  const load = await loadCustomerBookingRowForUser(admin, params.userId, params.bookingId, {
    viewerEmail: params.viewerEmail,
  });
  if (!load.ok) return { ok: false, status: load.status, error: load.error };

  const row = load.booking as Record<string, unknown>;
  const previousDate = typeof row.date === "string" ? row.date.slice(0, 10) : "";
  const previousTime = typeof row.time === "string" ? row.time.slice(0, 5) : "";
  const nextTime = params.time.slice(0, 5);
  if (previousDate === params.date && previousTime === nextTime) return { ok: true };

  const teamId = typeof row.team_id === "string" && row.team_id.trim() ? row.team_id.trim() : null;
  if (teamId) {
    return {
      ok: false,
      status: 409,
      error:
        "This booking already has a team assigned. Please contact support to reschedule so the team roster can be revalidated safely.",
    };
  }

  const cleanerId =
    typeof row.cleaner_id === "string" && row.cleaner_id.trim() ? row.cleaner_id.trim() : null;
  if (!cleanerId) return { ok: true };

  const durationMinutes =
    resolveSchedulingDurationMinutes(row, "validateCustomerBookingRescheduleAssignment") ?? 120;
  const slotStart = hmToMinutes(nextTime);
  const slotEnd = slotStart == null ? null : slotStart + durationMinutes;

  const { data: availabilityRows, error: availabilityError } = await admin
    .from("cleaner_availability")
    .select("start_time, end_time, is_available")
    .eq("cleaner_id", cleanerId)
    .eq("date", params.date)
    .eq("is_available", true);

  if (availabilityError) {
    return { ok: false, status: 503, error: "Could not verify cleaner availability for the new slot." };
  }

  const availabilityCoversSlot =
    slotStart != null &&
    slotEnd != null &&
    (availabilityRows ?? []).some((availability) => {
      const start = hmToMinutes((availability as { start_time?: unknown }).start_time);
      const end = hmToMinutes((availability as { end_time?: unknown }).end_time);
      return start != null && end != null && start <= slotStart && end >= slotEnd;
    });

  if (!availabilityCoversSlot) {
    return {
      ok: false,
      status: 409,
      error:
        "Your assigned cleaner is not available for that new time. Please contact support or choose another slot.",
    };
  }

  const conflictBookingId = await findCleanerSlotOccupancyConflict(admin, {
    cleanerId,
    dateYmd: params.date,
    timeHm: nextTime,
    durationMinutes,
    excludeBookingId: params.bookingId,
  });
  if (conflictBookingId) {
    return {
      ok: false,
      status: 409,
      error:
        "Your assigned cleaner already has another booking that overlaps this new time. Please choose another slot.",
    };
  }

  return { ok: true };
}
