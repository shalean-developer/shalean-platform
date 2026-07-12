import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanerWorksOnScheduledWeekday } from "@/lib/cleaner/availabilityWeekdays";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import {
  cleanerAreasAllowJob,
  type CleanerBase,
  type CleanerLocationPair,
  type GetEligibleCleanersParams,
} from "@/lib/booking/getEligibleCleaners";
import {
  cleanerPassesServiceCapabilityGate,
  serviceCapabilityGateFromBookingFields,
} from "@/lib/booking/serviceCapabilityEligibility";
import { cleanerAccountEligibleForOpsAssignment } from "@/lib/booking/cleanerSlotEligibility";

async function fetchCleanerLocationsForIds(
  admin: SupabaseClient,
  cleanerIds: string[],
): Promise<CleanerLocationPair[]> {
  if (cleanerIds.length === 0) return [];
  const { data, error } = await admin
    .from("cleaner_locations")
    .select("cleaner_id, location_id")
    .in("cleaner_id", cleanerIds);
  if (error) {
    console.error("[countOpsAssignableCleaners] cleaner_locations:", error.message);
    return [];
  }
  return (data ?? []) as CleanerLocationPair[];
}

/**
 * Count active cleaners who cover the service area and could be manually assigned later.
 * Does NOT require online/`is_available`, calendar fit, or free slot — that is the ops tier.
 */
export async function countOpsAssignableCleaners(
  admin: SupabaseClient,
  params: Pick<
    GetEligibleCleanersParams,
    "date" | "locationId" | "locationExpandedIds" | "serviceType" | "serviceLabelForCapability" | "limit"
  >,
): Promise<number> {
  const capabilityGate = serviceCapabilityGateFromBookingFields(
    params.serviceType,
    params.serviceLabelForCapability,
  );
  const expanded = params.locationExpandedIds;
  if (expanded != null && expanded.length === 0) return 0;

  const selWithWd =
    "id, full_name, phone, email, rating, is_active, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status, availability_weekdays";
  const selBase =
    "id, full_name, phone, email, rating, is_active, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status";
  const capCols = ", can_do_deep_cleaning, can_do_move_cleaning";

  const stripActiveCol = (s: string) => s.replace(", is_active", "");
  const runWith = async (columns: string, requireActiveEq: boolean) => {
    let q = admin.from("cleaners").select(columns);
    if (requireActiveEq) q = q.eq("is_active", true);
    return q;
  };

  let requireActive = true;
  let wd = selWithWd;
  let base = selBase;
  let r = await runWith(wd + capCols, requireActive);
  if (r.error && isUnknownColumnError(r.error, "is_active")) {
    requireActive = false;
    wd = stripActiveCol(selWithWd);
    base = stripActiveCol(selBase);
    r = await runWith(wd + capCols, false);
  }
  if (
    r.error &&
    (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
      isUnknownColumnError(r.error, "can_do_move_cleaning"))
  ) {
    r = await runWith(wd, requireActive);
  }
  if (r.error && isUnknownColumnError(r.error, "availability_weekdays")) {
    r = await runWith(base + capCols, requireActive);
    if (
      r.error &&
      (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
        isUnknownColumnError(r.error, "can_do_move_cleaning"))
    ) {
      r = await runWith(base, requireActive);
    }
  }
  if (r.error) {
    console.error("[countOpsAssignableCleaners] cleaners:", r.error.message);
    return 0;
  }

  const cleaners = ((r.data ?? []) as unknown as CleanerBase[]).filter((c) => {
    if (!cleanerAccountEligibleForOpsAssignment(c)) return false;
    if (!cleanerWorksOnScheduledWeekday(c.availability_weekdays, params.date)) return false;
    if (!cleanerPassesServiceCapabilityGate(c, capabilityGate)) return false;
    return true;
  });

  const locs = await fetchCleanerLocationsForIds(
    admin,
    cleaners.map((c) => c.id),
  );
  const locationsByCleaner = new Map<string, Set<string>>();
  for (const row of locs) {
    const set = locationsByCleaner.get(row.cleaner_id) ?? new Set<string>();
    set.add(String(row.location_id));
    locationsByCleaner.set(row.cleaner_id, set);
  }

  const limit = params.limit ?? 500;
  let count = 0;
  for (const c of cleaners) {
    const allowed = locationsByCleaner.get(c.id) ?? new Set<string>();
    const fallback = c.location_id ? String(c.location_id) : null;
    if (!cleanerAreasAllowJob(allowed, fallback, expanded ?? (params.locationId ? [params.locationId] : null))) {
      continue;
    }
    count += 1;
    if (count >= limit) break;
  }
  return count;
}
