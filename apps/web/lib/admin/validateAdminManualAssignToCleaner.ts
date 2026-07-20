import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveJobDurationMinutes } from "@/lib/admin/adminAssignEligibility";
import { adminAssignmentWarningFromWorkloadWarning } from "@/lib/admin/adminAssignEligibility";
import type { AdminAssignOneResult } from "@/lib/admin/performAdminAssignToCleaner";
import { buildAdminWarning, type AdminWarning } from "@/lib/admin/adminWarningPayload";
import { maxCleanerDailyWorkloadEnforceAdmin } from "@/lib/booking/availabilityFlags";
import {
  buildDailyCleanerWorkloadShadowReport,
  type DailyWorkloadWarning,
  warningFromDailyWorkloadShadowDay,
} from "@/lib/booking/cleanerDailyWorkloadShadow";
import { healBookingDurationForScheduling } from "@/lib/booking/quote/healBookingDurationForScheduling";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";

type BookingRow = {
  id: string;
  date?: string | null;
  time?: string | null;
  status?: string | null;
  cleaner_id?: string | null;
  city_id?: string | null;
  dispatch_status?: string | null;
  duration_minutes?: number | null;
  estimated_duration_minutes?: number | null;
  duration_hours?: number | null;
  pricing_summary?: unknown;
  booking_snapshot?: unknown;
  price_snapshot?: unknown;
  rooms?: number | null;
  bathrooms?: number | null;
  extras?: unknown;
  location_id?: string | null;
  service_slug?: string | null;
  service?: string | null;
};

export type AdminManualAssignValidationOk = {
  ok: true;
  booking: BookingRow;
  resolvedCleanerId: string;
  prevCleaner: string | null | undefined;
  workloadWarning: DailyWorkloadWarning | null;
  warnings: AdminWarning[];
};

export type AdminManualAssignValidationResult = AdminManualAssignValidationOk | Extract<AdminAssignOneResult, { ok: false }>;

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
    .select("id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job, date, status, duration_minutes")
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
  return day ? warningFromDailyWorkloadShadowDay(day) : null;
}

/** Shared slot/city/offline/workload gates for admin manual solo cleaner assign (offer or direct). */
export async function validateAdminManualAssignToCleaner(
  admin: SupabaseClient,
  params: { bookingId: string; cleanerId: string; force: boolean },
): Promise<AdminManualAssignValidationResult> {
  const { bookingId, cleanerId, force } = params;

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select(
      "id, date, time, status, cleaner_id, city_id, dispatch_status, duration_minutes, estimated_duration_minutes, duration_hours, pricing_summary, booking_snapshot, price_snapshot, rooms, bathrooms, extras, location_id, service_slug, service, cleaner_response_status, accepted_at",
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
  const healed = await healBookingDurationForScheduling(admin, b);
  const durationMinutes =
    healed.durationMinutes != null
      ? Math.min(9 * 60, Math.max(60, healed.durationMinutes))
      : effectiveJobDurationMinutes(b);
  if (durationMinutes == null) {
    return {
      ok: false,
      httpStatus: 422,
      error: "Booking has no persisted duration. Re-quote or edit the booking before assigning.",
    };
  }
  if (healed.healed) {
    b.duration_minutes = healed.durationMinutes;
    b.estimated_duration_minutes = healed.durationMinutes;
  }

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
    const locId = String(b.location_id ?? "").trim();
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

  const warnings = workloadWarning ? [adminAssignmentWarningFromWorkloadWarning(workloadWarning)] : [];

  return {
    ok: true,
    booking: b,
    resolvedCleanerId,
    prevCleaner,
    workloadWarning,
    warnings,
  };
}
