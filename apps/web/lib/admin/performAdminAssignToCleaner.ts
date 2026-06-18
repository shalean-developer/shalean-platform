import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { effectiveJobDurationMinutes } from "@/lib/admin/adminAssignEligibility";
import { setAdminManualBookingOffered } from "@/lib/admin/adminManualBookingOfferCommand";
import { maxCleanerDailyWorkloadEnforceAdmin } from "@/lib/booking/availabilityFlags";
import {
  buildDailyCleanerWorkloadShadowReport,
  type DailyWorkloadWarning,
  warningFromDailyWorkloadShadowDay,
} from "@/lib/booking/cleanerDailyWorkloadShadow";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
import { resolveDispatchOfferAcceptTtlSeconds } from "@/lib/dispatch/dispatchOfferAcceptTtl";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { buildAdminWarning, type AdminWarning } from "@/lib/admin/adminWarningPayload";
import { adminAssignmentWarningFromWorkloadWarning } from "@/lib/admin/adminAssignEligibility";

export type AdminAssignOneResult =
  | {
      ok: true;
      cleanerId: string;
      offerId: string;
      expiresAtIso: string;
      workloadWarning?: DailyWorkloadWarning | null;
      workloadOverrideCode?: "admin_daily_workload_over_limit_force_override";
      workloadOverrideReason?: string;
      warnings?: AdminWarning[];
    }
  | { ok: false; httpStatus: number; error: string; code?: "admin_daily_workload_over_limit"; workloadWarning?: DailyWorkloadWarning | null; warnings?: AdminWarning[] };

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

async function loadAdminDailyWorkloadWarning(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    cleanerId: string;
    dateYmd: string;
    durationMinutes: number;
  },
): Promise<DailyWorkloadWarning | null> {
  const { data } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job, date, booking_date, status, duration_minutes")
    .eq("date", params.dateYmd)
    .eq("cleaner_id", params.cleanerId)
    .neq("id", params.bookingId);

  const report = buildDailyCleanerWorkloadShadowReport([
    ...((data ?? []) as Array<{
      id?: string | null;
      cleaner_id?: string | null;
      payout_owner_cleaner_id?: string | null;
      team_id?: string | null;
      is_team_job?: boolean | null;
      date?: string | null;
      booking_date?: string | null;
      status?: string | null;
      duration_minutes?: number | null;
    }>),
    {
      id: `${params.bookingId}:admin-candidate:${params.cleanerId}`,
      cleaner_id: params.cleanerId,
      date: params.dateYmd,
      duration_minutes: params.durationMinutes,
      is_team_job: false,
    },
  ]);
  const day = report.soloDays.find((d) => d.cleanerId === params.cleanerId && d.dateYmd === params.dateYmd);
  return warningFromDailyWorkloadShadowDay(day);
}

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
  const durationMinutes = effectiveJobDurationMinutes(b);

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
      durationMinutes,
      locationId: locId,
      locationExpandedIds: locId ? [locId] : null,
      cleanerIds: [resolvedCleanerId],
      limit: 5,
      serviceType: String(b.service_slug ?? "").trim() || null,
      serviceLabelForCapability: String(b.service ?? "").trim() || null,
      excludeBookingId: bookingId,
    });
    if (eligible.length === 0) {
      return {
        ok: false,
        httpStatus: 400,
        error:
          "Cleaner is not eligible for this slot (calendar, service area, overlap, or service capability). Pass force=true to override.",
        warnings: [
          buildAdminWarning({
            code: "admin.assignment.ineligible_cleaner_force_override_available",
            domain: "assignment",
            severity: "high",
            action: "force_override_available",
            blocking: true,
            message:
              "Cleaner is not eligible for this slot because of calendar, service area, overlap, or service capability.",
            fields: ["cleaner_id", "date", "time", "location_id", "service_slug"],
          }),
        ],
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
    return {
      ok: false,
      httpStatus: 400,
      error: "Cleaner is not available.",
      warnings: [
        buildAdminWarning({
          code: "admin.assignment.offline_cleaner_force_override_available",
          domain: "assignment",
          severity: "high",
          action: "force_override_available",
          blocking: true,
          message: "Cleaner is offline. Admin force assignment can override this.",
          fields: ["cleaner_id"],
        }),
      ],
    };
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
      warnings: [
        buildAdminWarning({
          code: "admin.assignment.unavailable_cleaner_force_override_available",
          domain: "assignment",
          severity: "high",
          action: "force_override_available",
          blocking: true,
          message: "Cleaner has toggled themselves unavailable. Admin force assignment can override this.",
          fields: ["cleaner_id"],
        }),
      ],
    };
  }

  const workloadWarning =
    dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)
      ? await loadAdminDailyWorkloadWarning(admin, {
          bookingId,
          cleanerId: resolvedCleanerId,
          dateYmd,
          durationMinutes,
        })
      : null;
  if (
    maxCleanerDailyWorkloadEnforceAdmin() &&
    !force &&
    workloadWarning?.code === "daily_workload_over_limit"
  ) {
    return {
      ok: false,
      httpStatus: 400,
      code: "admin_daily_workload_over_limit",
      workloadWarning,
      error:
        "Cleaner would exceed the 8-hour daily workload limit for this date. Use force=true to override.",
      warnings: [adminAssignmentWarningFromWorkloadWarning(workloadWarning)],
    };
  }

  const dispatchWasUnassignable = String(b.dispatch_status ?? "").toLowerCase() === "unassignable";
  const nowIsoForPending = new Date().toISOString();

  const offered = await setAdminManualBookingOffered({
    admin,
    bookingId,
    dispatchWasUnassignable,
    nowIsoForPending,
  });

  if (!offered.ok) {
    return { ok: false, httpStatus: 500, error: offered.error };
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

  const warnings = workloadWarning ? [adminAssignmentWarningFromWorkloadWarning(workloadWarning)] : [];

  return {
    ok: true,
    cleanerId: resolvedCleanerId,
    offerId: offer.offerId,
    expiresAtIso: offer.expiresAtIso,
    workloadWarning,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(force && workloadWarning?.code === "daily_workload_over_limit"
      ? {
          workloadOverrideCode: "admin_daily_workload_over_limit_force_override" as const,
          workloadOverrideReason: "Admin force override allowed assignment above the 8-hour daily workload policy.",
        }
      : {}),
  };
}
