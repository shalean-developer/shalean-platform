import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import {
  busyUntilFromOverlappingJobs,
  cleanerSlotMatchesCalendar,
  effectiveJobDurationMinutes,
} from "@/lib/admin/adminAssignEligibility";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { hmToMinutes } from "@/lib/dispatch/timeWindow";

export type AdminAssignOneResult =
  | { ok: true; cleanerId: string; offerId: string; expiresAtIso: string }
  | { ok: false; httpStatus: number; error: string };

type BookingRow = {
  id: string;
  date?: string | null;
  time?: string | null;
  status?: string | null;
  cleaner_id?: string | null;
  city_id?: string | null;
  dispatch_status?: string | null;
  duration_minutes?: number | null;
};

/**
 * Admin dispatch: validate slot + city, then reset booking to pending/offered and create a dispatch offer.
 * `cleanerId` must be `cleaners.id` (not auth user id).
 */
export async function performAdminAssignToCleaner(
  admin: SupabaseClient,
  params: { bookingId: string; cleanerId: string; force: boolean },
): Promise<AdminAssignOneResult> {
  const { bookingId, cleanerId, force } = params;

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, time, status, cleaner_id, city_id, dispatch_status, duration_minutes")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { ok: false, httpStatus: 404, error: "Booking not found." };
  }

  const b = booking as BookingRow;
  const st = String(b.status ?? "").toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed") {
    return { ok: false, httpStatus: 400, error: "Booking cannot be assigned in this state." };
  }

  const dateYmd = String(b.date ?? "");
  const timeHm = String(b.time ?? "");

  const { data: cleaner, error: cErr } = await admin
    .from("cleaners")
    .select("id, status, city_id")
    .eq("id", cleanerId)
    .maybeSingle();

  if (cErr || !cleaner) {
    return { ok: false, httpStatus: 404, error: "Cleaner not found." };
  }

  const resolvedCleanerId = String((cleaner as { id: string }).id);

  if (!force && dateYmd && timeHm) {
    const { data: windows } = await admin
      .from("cleaner_availability")
      .select("start_time, end_time, is_available")
      .eq("cleaner_id", resolvedCleanerId)
      .eq("date", dateYmd)
      .eq("is_available", true);

    const winRows =
      (windows ?? []).map((w) => ({
        start_time: String((w as { start_time?: string }).start_time ?? "00:00"),
        end_time: String((w as { end_time?: string }).end_time ?? "23:59"),
        is_available: Boolean((w as { is_available?: boolean }).is_available),
      })) ?? [];

    if (!cleanerSlotMatchesCalendar(winRows, timeHm)) {
      return {
        ok: false,
        httpStatus: 400,
        error:
          "No calendar window for this cleaner on this date/time (roster ≠ slot-free). Pass force=true to override.",
      };
    }

    const startMin = hmToMinutes(timeHm.trim().slice(0, 5));
    const durationMin = effectiveJobDurationMinutes(b);
    if (startMin != null) {
      const { data: others } = await admin
        .from("bookings")
        .select("time, duration_minutes, status")
        .eq("date", dateYmd)
        .eq("cleaner_id", resolvedCleanerId)
        .neq("id", bookingId);

      const otherRows = (others ?? []).filter((row) => {
        const s = String((row as { status?: string }).status ?? "").toLowerCase();
        return ["pending", "assigned", "in_progress", "confirmed"].includes(s);
      }) as Array<{ time: string | null; duration_minutes?: number | null }>;

      if (busyUntilFromOverlappingJobs(startMin, durationMin, otherRows) != null) {
        return {
          ok: false,
          httpStatus: 400,
          error: "Cleaner already has a job overlapping this slot. Pass force=true to override.",
        };
      }
    }
  }

  const prevCleaner = b.cleaner_id;
  const cleanerStatus = String((cleaner as { status?: string | null }).status ?? "").toLowerCase();
  const bookingCityId = String(b.city_id ?? "");
  const cleanerCityId = String((cleaner as { city_id?: string | null }).city_id ?? "");
  if (bookingCityId && cleanerCityId && bookingCityId !== cleanerCityId) {
    return { ok: false, httpStatus: 400, error: "Cleaner is in a different city." };
  }
  if (!force && cleanerStatus === "offline") {
    return { ok: false, httpStatus: 400, error: "Cleaner is not available." };
  }

  const dispatchWasUnassignable = String(b.dispatch_status ?? "").toLowerCase() === "unassignable";
  const nowIsoForPending = new Date().toISOString();

  const { error: uErr } = await admin
    .from("bookings")
    .update({
      cleaner_id: null,
      status: "pending",
      dispatch_status: "offered",
      assigned_at: null,
      ...(dispatchWasUnassignable ? { became_pending_at: nowIsoForPending } : {}),
    })
    .eq("id", bookingId);

  if (uErr) {
    return { ok: false, httpStatus: 500, error: uErr.message };
  }

  await admin
    .from("dispatch_offers")
    .update({ status: "expired", responded_at: nowIsoForPending })
    .eq("booking_id", bookingId)
    .eq("status", "pending");

  const offer = await createDispatchOfferRow({
    supabase: admin,
    bookingId,
    cleanerId: resolvedCleanerId,
    rankIndex: 0,
    ttlSeconds: 60,
  });
  if (!offer.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[performAdminAssignToCleaner] createDispatchOfferRow failed", {
        bookingId,
        cleanerId: resolvedCleanerId,
        error: offer.error,
      });
    }
    return { ok: false, httpStatus: 500, error: offer.error || "Could not create offer." };
  }

  if (prevCleaner && prevCleaner !== resolvedCleanerId) {
    await syncCleanerBusyFromBookings(admin, prevCleaner);
  }

  return {
    ok: true,
    cleanerId: resolvedCleanerId,
    offerId: offer.offerId,
    expiresAtIso: offer.expiresAtIso,
  };
}
