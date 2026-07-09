import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { cleanerWorksOnScheduledWeekday } from "@/lib/cleaner/availabilityWeekdays";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import { isStrictAvailabilityEnabled } from "@/lib/booking/availabilityFlags";
import { cleanerAreasAllowJob, jobFitsAvailabilityWindows } from "@/lib/booking/getEligibleCleaners";
import { cleanerAccountEligibleForCustomerBooking } from "@/lib/booking/cleanerSlotEligibility";
import {
  cleanerPassesServiceCapabilityGate,
  serviceCapabilityGateFromBookingFields,
} from "@/lib/booking/serviceCapabilityEligibility";
import {
  buildDailyCleanerWorkloadShadowReport,
  type DailyWorkloadWarning,
  warningFromDailyWorkloadShadowDay,
} from "@/lib/booking/cleanerDailyWorkloadShadow";
import { hmToMinutes } from "@/lib/dispatch/timeWindow";
import {
  cleanerPreferenceStrictExcludesJob,
  type CleanerPreferenceRowLike,
} from "@/lib/dispatch/cleanerPreferenceMatch";
import { buildAdminWarning, type AdminWarning } from "@/lib/admin/adminWarningPayload";
import { resolveSchedulingDurationMinutes } from "@/lib/booking/quote/bookingQuotePersistence";

/** @deprecated Scheduling uses persisted duration via {@link resolveSchedulingDurationMinutes}. */
export const DEFAULT_ASSIGN_JOB_DURATION_MIN = 240;

type AvRow = { start_time: string; end_time: string; is_available: boolean };

/** @deprecated Use {@link jobFitsAvailabilityWindows} with job duration. */
export function cleanerSlotMatchesCalendar(windows: AvRow[], bookingTimeHm: string): boolean {
  const t = hmToMinutes(bookingTimeHm.trim().slice(0, 5));
  if (t == null) return false;
  return jobFitsAvailabilityWindows(windows, t, t + DEFAULT_ASSIGN_JOB_DURATION_MIN, !isStrictAvailabilityEnabled());
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function dayMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  return hmToMinutes(hm.trim().slice(0, 5));
}

const ACTIVE = new Set(["pending", "pending_payment", "assigned", "in_progress", "confirmed"]);

/** Bookings that still consume capacity in the schedule for overlap / demand hints. */
export const SCHEDULE_DEMAND_STATUSES = new Set([
  "pending",
  "pending_payment",
  "assigned",
  "in_progress",
  "confirmed",
]);

export function effectiveJobDurationMinutes(row: {
  id?: string | null;
  duration_minutes?: number | null;
  estimated_duration_minutes?: number | null;
  pricing_summary?: unknown;
  booking_snapshot?: unknown;
}): number | null {
  const resolved = resolveSchedulingDurationMinutes(row, "adminAssignEligibility.effectiveJobDurationMinutes");
  if (resolved == null) return null;
  return Math.min(9 * 60, Math.max(60, resolved));
}

export function busyUntilFromOverlappingJobs(
  bookingStartMin: number,
  bookingDurationMin: number,
  others: Array<{ time: string | null; duration_minutes?: number | null }>,
): number | null {
  return overlapBlockingDetail(bookingStartMin, bookingDurationMin, others).busyUntilMin;
}

export function overlapBlockingDetail(
  bookingStartMin: number,
  bookingDurationMin: number,
  others: Array<{ time: string | null; duration_minutes?: number | null }>,
): { busyUntilMin: number | null; overlapJobRangeLabel: string | null } {
  const bookingEnd = bookingStartMin + bookingDurationMin;
  let maxEnd: number | null = null;
  let rangeAtMax: string | null = null;
  for (const o of others) {
    const os = dayMinutes(o.time);
    if (os == null) continue;
    const od = effectiveJobDurationMinutes(o);
    if (od == null) continue;
    const oe = os + od;
    if (intervalsOverlap(bookingStartMin, bookingEnd, os, oe)) {
      const rangeLabel = `${formatMinutesAsHm(os)}–${formatMinutesAsHm(oe)}`;
      if (maxEnd == null || oe > maxEnd) {
        maxEnd = oe;
        rangeAtMax = rangeLabel;
      }
    }
  }
  return { busyUntilMin: maxEnd, overlapJobRangeLabel: rangeAtMax };
}

const NEXT_SLOT_STEP_MIN = 15;
const NEXT_SLOT_SEARCH_END_MIN = 21 * 60;

export function nextAvailableBookingStartHm(
  startFromMin: number,
  durationMin: number,
  windows: AvRow[],
  others: Array<{ time: string | null; duration_minutes?: number | null }>,
): string | null {
  const strict = isStrictAvailabilityEnabled();
  let t = Math.ceil(startFromMin / NEXT_SLOT_STEP_MIN) * NEXT_SLOT_STEP_MIN;
  for (; t + durationMin <= NEXT_SLOT_SEARCH_END_MIN; t += NEXT_SLOT_STEP_MIN) {
    const winObjs = windows.map((w) => ({
      start_time: String(w.start_time).slice(0, 5),
      end_time: String(w.end_time).slice(0, 5),
      is_available: Boolean(w.is_available),
    }));
    if (!jobFitsAvailabilityWindows(winObjs, t, t + durationMin, strict)) continue;
    if (busyUntilFromOverlappingJobs(t, durationMin, others) != null) continue;
    return formatMinutesAsHm(t);
  }
  return null;
}

export async function countBookingsOverlappingDemandSlot(
  admin: SupabaseClient,
  params: { dateYmd: string; cityId: string | null; slotStartMin: number; slotDurationMin: number },
): Promise<number> {
  const { dateYmd, cityId, slotStartMin, slotDurationMin } = params;
  const slotEnd = slotStartMin + slotDurationMin;
  let q = admin
    .from("bookings")
    .select("id, time, duration_minutes, estimated_duration_minutes, pricing_summary, booking_snapshot, status")
    .eq("date", dateYmd);
  if (cityId) q = q.eq("city_id", cityId);
  const { data: rows } = await q;
  let n = 0;
  for (const raw of rows ?? []) {
    const row = raw as {
      id?: string;
      time?: string | null;
      duration_minutes?: number | null;
      estimated_duration_minutes?: number | null;
      pricing_summary?: unknown;
      booking_snapshot?: unknown;
      status?: string | null;
    };
    const st = String(row.status ?? "").toLowerCase();
    if (!SCHEDULE_DEMAND_STATUSES.has(st)) continue;
    const os = dayMinutes(row.time);
    if (os == null) continue;
    const od = effectiveJobDurationMinutes(row);
    if (od == null) continue;
    const oe = os + od;
    if (!intervalsOverlap(slotStartMin, slotEnd, os, oe)) continue;
    n += 1;
  }
  return n;
}

export function formatMinutesAsHm(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type AssignEligibilityRow = {
  cleanerId: string;
  /** Admin roster: booking weekday is in `cleaners.availability_weekdays`. */
  weekdayOk: boolean;
  calendarWindowOk?: boolean;
  slotCalendarOk: boolean;
  locationOk?: boolean;
  overlapBlocked: boolean;
  busyUntilMin: number | null;
  overlapJobRangeLabel: string | null;
  nextAvailableStartHm: string | null;
  offline: boolean;
  /**
   * M-13/M-14: account-level ineligibility — cleaner is `is_active=false`,
   * `is_available=false` (the manual "Go offline" toggle), or in a blocked
   * lifecycle status (`busy`, `suspended`, `banned`, `disabled`, `blocked`).
   *
   * Reflects the same {@link cleanerAccountEligibleForCustomerBooking} gate
   * the canonical {@link getEligibleCleaners} pool uses, so admin scheduling
   * surfaces the SAME exclusions checkout sees. Independent of the strict
   * availability flag — these are absolute, not strict-mode-toggled.
   *
   * `offline` (status==="offline") remains separate because it has its own
   * UI label and historical force-override semantics; `accountIneligible`
   * is the broader "should not be in normal eligibility" signal.
   */
  accountIneligible: boolean;
  serviceCapabilityOk?: boolean;
  /**
   * Strict `cleaner_preferences.preferred_services` — same gate as
   * {@link getEligibleCleaners} / dispatch when `bookingCapabilitySlug` is set.
   */
  servicePreferenceOk?: boolean;
  workloadWarning: DailyWorkloadWarning | null;
  canAssignWithoutForce: boolean;
};

export function adminAssignmentWarningFromWorkloadWarning(warning: DailyWorkloadWarning): AdminWarning {
  if (warning.code === "daily_workload_over_limit") {
    return buildAdminWarning({
      code: "admin.assignment.daily_workload_over_limit_requires_confirmation",
      domain: "assignment",
      severity: "high",
      action: "requires_confirmation",
      blocking: true,
      message: "Cleaner would exceed the 8-hour daily workload policy.",
      fields: ["cleaner_id", "duration_minutes"],
      diagnostics: { workloadWarning: warning },
      requiredConfirmation: { token: "force_8h_workload", reasonRequired: true },
    });
  }
  if (warning.code === "duration_fallback_used") {
    return buildAdminWarning({
      code: "admin.assignment.duration_fallback_used",
      domain: "assignment",
      severity: "medium",
      action: "diagnostic_only",
      blocking: false,
      message: "Assignment workload calculation used fallback duration for one or more bookings.",
      fields: ["duration_minutes"],
      diagnostics: { workloadWarning: warning },
    });
  }
  return buildAdminWarning({
    code: "admin.assignment.daily_workload_near_limit",
    domain: "assignment",
    severity: "medium",
    action: "diagnostic_only",
    blocking: false,
    message: "Cleaner is near the 8-hour daily workload policy.",
    fields: ["cleaner_id", "duration_minutes"],
    diagnostics: { workloadWarning: warning },
  });
}

export function buildAdminAssignmentEligibilityWarnings(row: AssignEligibilityRow): AdminWarning[] {
  const warnings: AdminWarning[] = [];
  if (row.offline) {
    warnings.push(
      buildAdminWarning({
        code: "admin.assignment.offline_cleaner_force_override_available",
        domain: "assignment",
        severity: "high",
        action: "force_override_available",
        blocking: true,
        message: "Cleaner is offline. Admin force assignment can override this.",
        fields: ["cleaner_id"],
      }),
    );
  }
  if (row.accountIneligible) {
    warnings.push(
      buildAdminWarning({
        code: "admin.assignment.account_ineligible_force_override_available",
        domain: "assignment",
        severity: "high",
        action: "force_override_available",
        blocking: true,
        message: "Cleaner account is unavailable, inactive, or blocked.",
        fields: ["cleaner_id"],
      }),
    );
  }
  if (row.overlapBlocked) {
    warnings.push(
      buildAdminWarning({
        code: "admin.assignment.overlap_force_override_available",
        domain: "assignment",
        severity: "high",
        action: "force_override_available",
        blocking: true,
        message: "Cleaner has an overlapping active booking.",
        fields: ["cleaner_id", "time"],
        diagnostics: {
          busyUntilMin: row.busyUntilMin,
          overlapJobRangeLabel: row.overlapJobRangeLabel,
        },
      }),
    );
  }
  if (!row.weekdayOk) {
    warnings.push(
      buildAdminWarning({
        code: "admin.assignment.weekday_unavailable_force_override_available",
        domain: "assignment",
        severity: "medium",
        action: "force_override_available",
        blocking: true,
        message: "Cleaner does not normally work on this weekday.",
        fields: ["cleaner_id", "date"],
      }),
    );
  }
  if (row.calendarWindowOk === false) {
    warnings.push(
      buildAdminWarning({
        code: "admin.assignment.availability_window_force_override_available",
        domain: "assignment",
        severity: "medium",
        action: "force_override_available",
        blocking: true,
        message: "Booking time is outside the cleaner availability window.",
        fields: ["cleaner_id", "time"],
      }),
    );
  }
  if (row.locationOk === false) {
    warnings.push(
      buildAdminWarning({
        code: "admin.assignment.location_mismatch_force_override_available",
        domain: "assignment",
        severity: "high",
        action: "force_override_available",
        blocking: true,
        message: "Cleaner is not configured for this service area.",
        fields: ["cleaner_id", "location_id"],
      }),
    );
  }
  if (row.serviceCapabilityOk === false) {
    warnings.push(
      buildAdminWarning({
        code: "admin.assignment.service_capability_force_override_available",
        domain: "assignment",
        severity: "high",
        action: "force_override_available",
        blocking: true,
        message: "Cleaner is missing the service capability for this booking.",
        fields: ["cleaner_id", "service_slug"],
      }),
    );
  }
  if (row.servicePreferenceOk === false) {
    warnings.push(
      buildAdminWarning({
        code: "admin.assignment.service_preference_force_override_available",
        domain: "assignment",
        severity: "high",
        action: "force_override_available",
        blocking: true,
        message: "Cleaner strict service preferences exclude this booking.",
        fields: ["cleaner_id", "service_slug"],
      }),
    );
  }
  if (row.workloadWarning) warnings.push(adminAssignmentWarningFromWorkloadWarning(row.workloadWarning));
  return warnings;
}

export async function computeAssignEligibility(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    bookingDateYmd: string;
    bookingTimeHm: string;
    durationMinutes: number;
    cleanerIds: string[];
    /** Booking `location_id` when known. */
    bookingLocationId?: string | null;
    /** When set, overrides single-location expansion for eligibility. */
    bookingLocationExpandedIds?: string[] | null;
    bookingCapabilitySlug?: string | null;
    bookingCapabilityLabel?: string | null;
  },
): Promise<Map<string, AssignEligibilityRow>> {
  const out = new Map<string, AssignEligibilityRow>();
  const {
    bookingId,
    bookingDateYmd,
    bookingTimeHm,
    durationMinutes,
    cleanerIds,
    bookingLocationId,
    bookingLocationExpandedIds,
    bookingCapabilitySlug,
    bookingCapabilityLabel,
  } = params;
  const capabilityGate = serviceCapabilityGateFromBookingFields(bookingCapabilitySlug, bookingCapabilityLabel);
  const startMin = dayMinutes(bookingTimeHm);
  const strict = isStrictAvailabilityEnabled();
  if (!cleanerIds.length || startMin == null) {
    for (const id of cleanerIds) {
      out.set(id, {
        cleanerId: id,
        weekdayOk: false,
        calendarWindowOk: false,
        slotCalendarOk: false,
        locationOk: false,
        overlapBlocked: false,
        busyUntilMin: null,
        overlapJobRangeLabel: null,
        nextAvailableStartHm: null,
        offline: false,
        accountIneligible: false,
        serviceCapabilityOk: true,
        servicePreferenceOk: true,
        workloadWarning: null,
        canAssignWithoutForce: false,
      });
    }
    return out;
  }
  const slotEnd = startMin + durationMinutes;
  const jobServiceSlug = (bookingCapabilitySlug ?? "").trim().toLowerCase() || null;
  const jobPrefCtx =
    jobServiceSlug != null
      ? {
          jobLocationId: (bookingLocationId ?? "").trim(),
          jobServiceSlug,
          jobDateYmd: bookingDateYmd,
          jobTimeHm: bookingTimeHm.trim().slice(0, 5),
        }
      : null;

  type CleanerAvailRow = {
    id?: string;
    status?: string | null;
    is_active?: boolean | null;
    is_available?: boolean | null;
    location_id?: string | null;
    availability_weekdays?: string[] | null;
    can_do_deep_cleaning?: boolean | null;
    can_do_move_cleaning?: boolean | null;
  };
  let cleaners: CleanerAvailRow[] | null = null;
  {
    // M-13/M-14: previously this select omitted `is_active` / `is_available`,
    // so admin scheduling silently treated cleaners with the manual
    // "Go offline" flag (`is_available=false`) as fully assignable —
    // diverging from the canonical `getEligibleCleaners` pool which DB-filters
    // them out. We now load both columns (with column-presence fallbacks for
    // schemas missing `is_active`) and feed them to
    // `cleanerAccountEligibleForCustomerBooking` below.
    const cap = ", can_do_deep_cleaning, can_do_move_cleaning";
    const baseWithActive = "id, status, is_active, is_available, location_id, availability_weekdays";
    const baseNoActive = "id, status, is_available, location_id, availability_weekdays";
    const baseWithActiveNoWd = "id, status, is_active, is_available, location_id";
    const baseNoActiveNoWd = "id, status, is_available, location_id";
    type FetchRow = { data: unknown; error: PostgrestError | null };
    let r = (await admin.from("cleaners").select(`${baseWithActive}${cap}`).in("id", cleanerIds)) as FetchRow;
    if (r.error && isUnknownColumnError(r.error, "is_active")) {
      r = (await admin.from("cleaners").select(`${baseNoActive}${cap}`).in("id", cleanerIds)) as FetchRow;
    }
    if (
      r.error &&
      (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
        isUnknownColumnError(r.error, "can_do_move_cleaning"))
    ) {
      r = (await admin.from("cleaners").select(baseWithActive).in("id", cleanerIds)) as FetchRow;
      if (r.error && isUnknownColumnError(r.error, "is_active")) {
        r = (await admin.from("cleaners").select(baseNoActive).in("id", cleanerIds)) as FetchRow;
      }
    }
    if (r.error && isUnknownColumnError(r.error, "availability_weekdays")) {
      r = (await admin.from("cleaners").select(`${baseWithActiveNoWd}${cap}`).in("id", cleanerIds)) as FetchRow;
      if (r.error && isUnknownColumnError(r.error, "is_active")) {
        r = (await admin.from("cleaners").select(`${baseNoActiveNoWd}${cap}`).in("id", cleanerIds)) as FetchRow;
      }
      if (
        r.error &&
        (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
          isUnknownColumnError(r.error, "can_do_move_cleaning"))
      ) {
        r = (await admin.from("cleaners").select(baseWithActiveNoWd).in("id", cleanerIds)) as FetchRow;
        if (r.error && isUnknownColumnError(r.error, "is_active")) {
          r = (await admin.from("cleaners").select(baseNoActiveNoWd).in("id", cleanerIds)) as FetchRow;
        }
      }
    }
    cleaners = (r.data ?? null) as CleanerAvailRow[] | null;
  }

  const offlineById = new Map<string, boolean>();
  const accountIneligibleById = new Map<string, boolean>();
  const fallbackLocationById = new Map<string, string | null>();
  const weekdaysById = new Map<string, string[] | null>();
  const capabilityOkById = new Map<string, boolean>();
  for (const c of cleaners ?? []) {
    const row = c as CleanerAvailRow;
    if (row.id) {
      const id = String(row.id);
      offlineById.set(id, String(row.status ?? "").toLowerCase() === "offline");
      // M-13/M-14: same gate the canonical `getEligibleCleaners` pool applies
      // (`is_active=false`, `is_available=false`, or blocked status). When a
      // column is missing from the row (legacy schema fallback), the helper
      // treats it as "not blocked" — same behavior as `getEligibleCleaners`.
      accountIneligibleById.set(
        id,
        !cleanerAccountEligibleForCustomerBooking({
          is_active: row.is_active,
          is_available: row.is_available,
          status: row.status,
        }),
      );
      fallbackLocationById.set(id, row.location_id ? String(row.location_id) : null);
      weekdaysById.set(id, Array.isArray(row.availability_weekdays) ? row.availability_weekdays : null);
      capabilityOkById.set(
        id,
        cleanerPassesServiceCapabilityGate(
          {
            can_do_deep_cleaning: row.can_do_deep_cleaning,
            can_do_move_cleaning: row.can_do_move_cleaning,
          },
          capabilityGate,
        ),
      );
    }
  }

  const { data: avRows } = await admin
    .from("cleaner_availability")
    .select("cleaner_id, start_time, end_time, is_available")
    .eq("date", bookingDateYmd)
    .in("cleaner_id", cleanerIds);

  const windowsByCleaner = new Map<string, AvRow[]>();
  for (const id of cleanerIds) windowsByCleaner.set(id, []);
  for (const r of avRows ?? []) {
    const row = r as { cleaner_id?: string; start_time?: string; end_time?: string; is_available?: boolean };
    const cid = String(row.cleaner_id ?? "");
    if (!cid) continue;
    const list = windowsByCleaner.get(cid);
    if (!list) continue;
    list.push({
      start_time: String(row.start_time ?? "00:00").slice(0, 5),
      end_time: String(row.end_time ?? "23:59").slice(0, 5),
      is_available: Boolean(row.is_available),
    });
  }

  const prefByCleaner = new Map<string, CleanerPreferenceRowLike>();
  if (jobPrefCtx) {
    const { data: prefRows } = await admin
      .from("cleaner_preferences")
      .select("cleaner_id, preferred_areas, preferred_services, preferred_time_blocks, is_strict")
      .in("cleaner_id", cleanerIds);
    for (const raw of prefRows ?? []) {
      const cid = String((raw as { cleaner_id?: string }).cleaner_id ?? "");
      if (cid) prefByCleaner.set(cid, raw as CleanerPreferenceRowLike);
    }
  }

  const { data: locRows } = await admin.from("cleaner_locations").select("cleaner_id, location_id").in("cleaner_id", cleanerIds);
  const locByCleaner = new Map<string, Set<string>>();
  for (const id of cleanerIds) locByCleaner.set(id, new Set());
  for (const raw of locRows ?? []) {
    const r = raw as { cleaner_id?: string; location_id?: string };
    const cid = String(r.cleaner_id ?? "");
    const lid = String(r.location_id ?? "").trim();
    if (!cid || !lid) continue;
    const s = locByCleaner.get(cid);
    if (s) s.add(lid);
  }

  const locExpanded =
    bookingLocationExpandedIds !== undefined
      ? bookingLocationExpandedIds
      : (bookingLocationId ?? "").trim()
        ? [(bookingLocationId ?? "").trim()]
        : null;

  const { data: dayBookings } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job, time, date, booking_date, duration_minutes, status")
    .eq("date", bookingDateYmd)
    .in("cleaner_id", cleanerIds)
    .neq("id", bookingId);

  const othersByCleaner = new Map<string, Array<{ time: string | null; duration_minutes?: number | null }>>();
  for (const id of cleanerIds) othersByCleaner.set(id, []);
  for (const b of dayBookings ?? []) {
    const row = b as {
      id?: string;
      cleaner_id?: string | null;
      time?: string | null;
      duration_minutes?: number | null;
      status?: string | null;
    };
    const st = String(row.status ?? "").toLowerCase();
    if (!ACTIVE.has(st)) continue;
    const cid = String(row.cleaner_id ?? "");
    const list = othersByCleaner.get(cid);
    if (list) list.push({ time: row.time ?? null, duration_minutes: row.duration_minutes });
  }
  const workloadReport = buildDailyCleanerWorkloadShadowReport([
    ...((dayBookings ?? []) as Array<{
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
    ...cleanerIds.map((id) => ({
      id: `${bookingId}:candidate:${id}`,
      cleaner_id: id,
      date: bookingDateYmd,
      duration_minutes: durationMinutes,
      is_team_job: false,
    })),
  ]);
  const workloadWarningByCleaner = new Map<string, DailyWorkloadWarning | null>();
  for (const day of workloadReport.soloDays) {
    if (day.dateYmd !== bookingDateYmd) continue;
    if (!cleanerIds.includes(day.cleanerId)) continue;
    workloadWarningByCleaner.set(day.cleanerId, warningFromDailyWorkloadShadowDay(day));
  }

  for (const id of cleanerIds) {
    const windows = windowsByCleaner.get(id) ?? [];
    const winObjs = windows.map((w) => ({
      start_time: w.start_time,
      end_time: w.end_time,
      is_available: w.is_available,
    }));
    const slotCalendarOk = jobFitsAvailabilityWindows(winObjs, startMin, slotEnd, strict);
    const allowed = locByCleaner.get(id) ?? new Set();
    const locationOk = cleanerAreasAllowJob(allowed, fallbackLocationById.get(id) ?? null, locExpanded);
    const weekdayOk = cleanerWorksOnScheduledWeekday(weekdaysById.get(id), bookingDateYmd);

    const others = othersByCleaner.get(id) ?? [];
    const overlapDetail = overlapBlockingDetail(startMin, durationMinutes, others);
    const busyUntilMin = overlapDetail.busyUntilMin;
    const overlapJobRangeLabel = overlapDetail.overlapJobRangeLabel;
    const overlapBlocked = busyUntilMin != null;
    const offline = offlineById.get(id) ?? false;
    const accountIneligible = accountIneligibleById.get(id) ?? false;
    const capabilityOk = capabilityOkById.get(id) ?? true;
    const prefRow = prefByCleaner.get(id);
    const servicePreferenceOk =
      !jobPrefCtx || !prefRow || !cleanerPreferenceStrictExcludesJob(prefRow, jobPrefCtx);
    // M-13/M-14: include `accountIneligible` (is_active=false / is_available=false /
    // blocked lifecycle status) as a hard gate, parallel to `offline`. Without this
    // a cleaner who toggled "Go offline" still showed `canAssignWithoutForce: true`
    // in the admin scheduling UI even though `getEligibleCleaners` (the checkout /
    // dispatch / single-assign canonical pool) excludes them.
    const canAssignWithoutForce =
      weekdayOk &&
      slotCalendarOk &&
      locationOk &&
      !overlapBlocked &&
      !offline &&
      !accountIneligible &&
      capabilityOk &&
      servicePreferenceOk;
    let nextAvailableStartHm: string | null = null;
    // M-13/M-14: don't suggest a "next available" slot for someone who is
    // account-ineligible — the suggestion would be misleading because the
    // cleaner is unavailable for ANY future slot until they re-toggle
    // `is_available` (and the calendar suggestion engine doesn't know that).
    if (!offline && !accountIneligible && !canAssignWithoutForce) {
      nextAvailableStartHm = nextAvailableBookingStartHm(startMin, durationMinutes, windows, others);
      const curHm = bookingTimeHm.trim().slice(0, 5);
      if (nextAvailableStartHm === curHm) nextAvailableStartHm = null;
    }

    out.set(id, {
      cleanerId: id,
      weekdayOk,
      calendarWindowOk: slotCalendarOk,
      slotCalendarOk: slotCalendarOk && locationOk,
      locationOk,
      overlapBlocked,
      busyUntilMin,
      overlapJobRangeLabel,
      nextAvailableStartHm,
      offline,
      accountIneligible,
      serviceCapabilityOk: capabilityOk,
      servicePreferenceOk,
      workloadWarning: workloadWarningByCleaner.get(id) ?? null,
      canAssignWithoutForce,
    });
  }

  return out;
}
