import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { effectiveJobDurationMinutes } from "@/lib/admin/adminAssignEligibility";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
import { resolveDispatchOfferAcceptTtlSeconds } from "@/lib/dispatch/dispatchOfferAcceptTtl";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";

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
  location_id?: string | null;
  service_slug?: string | null;
  service?: string | null;
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
    .select(
      "id, date, time, status, cleaner_id, city_id, dispatch_status, duration_minutes, location_id, service_slug, service",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { ok: false, httpStatus: 404, error: "Booking not found." };
  }

  const b = booking as BookingRow;
  const st = String(b.status ?? "").toLowerCase();
  if (st === "pending_payment" || st === "payment_expired") {
    return {
      ok: false,
      httpStatus: 400,
      error: "Awaiting customer payment — assign a cleaner after the customer has paid.",
    };
  }
  if (st === "completed" || st === "cancelled" || st === "failed") {
    return { ok: false, httpStatus: 400, error: "Booking cannot be assigned in this state." };
  }

  const dateYmd = String(b.date ?? "");
  const timeHm = String(b.time ?? "");

  const { data: cleaner, error: cErr } = await admin
    .from("cleaners")
    .select("id, status, city_id, is_available")
    .eq("id", cleanerId)
    .maybeSingle();

  if (cErr || !cleaner) {
    return { ok: false, httpStatus: 404, error: "Cleaner not found." };
  }

  const resolvedCleanerId = String((cleaner as { id: string }).id);

  if (!force && dateYmd && timeHm) {
    const locId = String((b as { location_id?: string | null }).location_id ?? "").trim();
    const eligible = await getEligibleCleaners(admin, {
      date: dateYmd,
      startTime: timeHm.trim().slice(0, 5),
      durationMinutes: effectiveJobDurationMinutes(b),
      locationId: locId,
      locationExpandedIds: locId ? [locId] : null,
      cleanerIds: [resolvedCleanerId],
      limit: 5,
      serviceType: String(b.service_slug ?? "").trim() || null,
      serviceLabelForCapability: String(b.service ?? "").trim() || null,
    });
    if (eligible.length === 0) {
      return {
        ok: false,
        httpStatus: 400,
        error:
          "Cleaner is not eligible for this slot (calendar, service area, overlap, or service capability). Pass force=true to override.",
      };
    }
  }

  const prevCleaner = b.cleaner_id;
  const cleanerStatus = String((cleaner as { status?: string | null }).status ?? "").toLowerCase();
  const cleanerIsAvailable = (cleaner as { is_available?: boolean | null }).is_available;
  const bookingCityId = String(b.city_id ?? "");
  const cleanerCityId = String((cleaner as { city_id?: string | null }).city_id ?? "");
  if (bookingCityId && cleanerCityId && bookingCityId !== cleanerCityId) {
    return { ok: false, httpStatus: 400, error: "Cleaner is in a different city." };
  }
  if (!force && cleanerStatus === "offline") {
    return { ok: false, httpStatus: 400, error: "Cleaner is not available." };
  }
  // M-14: explicit defense-in-depth. Even though `getEligibleCleaners` above
  // already DB-filters `is_available=true` (and would have returned `[]` for
  // a `is_available=false` cleaner when `!force`), we surface a clearer error
  // message if the canonical pool was bypassed (no slot info → `!force` block
  // above is skipped) but the cleaner has explicitly toggled "Go offline".
  // Force-overridable, parallel to the `status==="offline"` gate above —
  // preserves intentional admin override behavior while ensuring the
  // `is_available=false` flag is *always* respected in the non-force path,
  // independent of the strict-availability flag.
  if (!force && cleanerIsAvailable === false) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Cleaner has toggled themselves unavailable. Pass force=true to override.",
    };
  }

  const dispatchWasUnassignable = String(b.dispatch_status ?? "").toLowerCase() === "unassignable";
  const nowIsoForPending = new Date().toISOString();

  const { error: uErr } = await admin
    .from("bookings")
    .update({
      cleaner_id: null,
      status: "offered",
      dispatch_status: "offered",
      assigned_at: null,
      accepted_at: null,
      ...BOOKING_PAYOUT_COLUMNS_CLEAR,
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
    ttlSeconds: resolveDispatchOfferAcceptTtlSeconds(),
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
