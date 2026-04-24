import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLocationContextFromLabel } from "@/lib/booking/resolveLocationId";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { softDispatchPoolCapsFromAttemptCount } from "@/lib/dispatch/dispatchCandidatePoolCaps";
import {
  smartAssignCleaner,
  type SmartAssignOptions,
} from "@/lib/dispatch/smartAssignCleaner";

export type { CleanerRow, AvailabilityRow } from "@/lib/dispatch/types";

export type AssignResult =
  | { ok: true; cleanerId: string }
  | { ok: false; error: "no_candidate" | "booking_not_pending" | "db_error"; message?: string };

export type AssignCleanerOptions = {
  /** From `dispatch_retry_queue.retries_done`: 0=area, 1+=city-wide pool. */
  retryEscalation?: number;
  smartAssign?: SmartAssignOptions;
};

/**
 * Auto-assign best cleaner (smart dispatch: location + availability + score).
 * Resolves `location_id` from `bookings.location` text when missing.
 */
export async function assignCleanerToBooking(
  supabase: SupabaseClient,
  bookingId: string,
  options?: AssignCleanerOptions,
): Promise<AssignResult> {
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, date, time, status, cleaner_id, location_id, location, dispatch_status, dispatch_attempt_count")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { ok: false, error: "db_error", message: bErr?.message };
  }

  const st = String((booking as { status?: string }).status ?? "").toLowerCase();
  if (st !== "pending") {
    return { ok: false, error: "booking_not_pending" };
  }
  if ((booking as { cleaner_id?: string | null }).cleaner_id) {
    return { ok: false, error: "booking_not_pending", message: "Already assigned" };
  }
  const ds = String((booking as { dispatch_status?: string | null }).dispatch_status ?? "").toLowerCase();
  if (ds === "unassignable") {
    return {
      ok: false,
      error: "booking_not_pending",
      message: "Dispatch marked unassignable — reset in admin or assign manually.",
    };
  }

  let locationId = (booking as { location_id?: string | null }).location_id ?? null;
  const locationText = (booking as { location?: string | null }).location ?? null;

  if (!locationId && locationText) {
    const resolved = await resolveLocationContextFromLabel(supabase, locationText);
    if (resolved.locationId) {
      const { error: locErr } = await supabase
        .from("bookings")
        .update({ location_id: resolved.locationId, city_id: resolved.cityId })
        .eq("id", bookingId);
      if (locErr) {
        await reportOperationalIssue("warn", "assignCleanerToBooking", `location_id update: ${locErr.message}`, {
          bookingId,
        });
      } else {
        locationId = resolved.locationId;
      }
    }
  }

  if (!locationId) {
    await reportOperationalIssue("warn", "assignCleanerToBooking", "No location_id — cannot match service area", {
      bookingId,
    });
    return { ok: false, error: "no_candidate", message: "Booking has no service area (location_id)" };
  }

  const dateYmd = String((booking as { date?: string }).date ?? "");
  const timeHm = String((booking as { time?: string }).time ?? "");

  const retryEsc = options?.retryEscalation ?? 0;
  const searchExpansion =
    retryEsc >= 3 ? "broadcast" : retryEsc >= 1 ? "city" : "none";
  const attemptCount =
    Number((booking as { dispatch_attempt_count?: number | null }).dispatch_attempt_count ?? 0) || 0;
  const poolCaps = softDispatchPoolCapsFromAttemptCount(attemptCount);
  const mergedSmart: SmartAssignOptions = {
    ...poolCaps,
    ...options?.smartAssign,
    searchExpansion,
    retryTier: retryEsc,
  };
  const result = await smartAssignCleaner(
    supabase,
    {
      bookingId,
      date: dateYmd,
      time: timeHm,
      locationId,
    },
    mergedSmart,
  );

  if (result.ok) {
    return { ok: true, cleanerId: result.cleanerId };
  }

  if (result.error === "params_mismatch") {
    return { ok: false, error: "db_error", message: result.message };
  }
  if (result.error === "invalid_booking_time" || result.error === "missing_job_coordinates") {
    return { ok: false, error: "no_candidate", message: result.message };
  }

  return {
    ok: false,
    error: result.error === "booking_not_pending" || result.error === "db_error" ? result.error : "no_candidate",
    message: result.message,
  };
}
