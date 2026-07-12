/**
 * Cleaner availability and slot windows only — no ZAR pricing (see `lib/pricing/pricingEngine.ts`).
 * Eligibility rules live in {@link getEligibleCleaners}.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import { isBookingSoftFulfillmentEnabled, maxCleanerDailyWorkloadEnforcePublic } from "@/lib/booking/availabilityFlags";
import type { AvailableCleaner, CleanerAvailabilityRow, CleanerReviewSnippet } from "@/lib/booking/cleanerPoolTypes";
import { cleanerAccountEligibleForCustomerBooking } from "@/lib/booking/cleanerSlotEligibility";
import { cleanerWorksOnScheduledWeekday } from "@/lib/cleaner/availabilityWeekdays";
import type { CleanerBase, CleanerLocationPair } from "@/lib/booking/getEligibleCleaners";
import {
  cleanerAreasAllowJob,
  fetchCleanerPreferencesByCleanerIds,
  fetchOccupyingBookingsForDate,
  getEligibleCleaners,
} from "@/lib/booking/getEligibleCleaners";
import { bookingSlotEligibilityDurationMinutes } from "@/lib/booking/bookingTimeSlots";
import {
  cleanerPassesServiceCapabilityGate,
  serviceCapabilityGateFromBookingFields,
} from "@/lib/booking/serviceCapabilityEligibility";
import type { BookingFulfillmentMode } from "@/lib/booking/bookingFulfillmentMode";

export type { AvailableCleaner, CleanerReviewSnippet, CleanerAvailabilityRow } from "@/lib/booking/cleanerPoolTypes";

const CLEANERS_LIST_SELECT_WITH_WEEKDAYS =
  "id, full_name, phone, email, rating, is_active, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status, availability_weekdays";
const CLEANERS_LIST_SELECT_BASE =
  "id, full_name, phone, email, rating, is_active, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status";
const CLEANERS_CAPABILITY_SUFFIX = ", can_do_deep_cleaning, can_do_move_cleaning";

/** Short TTL — cleaner roster barely changes during a booking session. */
const AVAILABLE_CLEANERS_CACHE_MS = 45_000;
let availableCleanersCache: { at: number; rows: CleanerBase[] } | null = null;

/**
 * Soft day-label for the slot grid only (confirm still runs full ops assessment).
 * Uses the already-loaded available cleaner pool — avoids a second full `cleaners` scan
 * via {@link countOpsAssignableCleaners} (~1–2s on typical DBs).
 */
function softDayFulfillmentFromPreloadedPool(
  cleaners: CleanerBase[],
  locs: CleanerLocationPair[],
  dateYmd: string,
  expanded: string[] | null,
  locationId: string,
  bookingServiceSlug: string | null,
  serviceLabelForCapability: string | null,
): BookingFulfillmentMode {
  const capabilityGate = serviceCapabilityGateFromBookingFields(
    bookingServiceSlug,
    serviceLabelForCapability,
  );
  const locationsByCleaner = new Map<string, Set<string>>();
  for (const row of locs) {
    const set = locationsByCleaner.get(row.cleaner_id) ?? new Set<string>();
    set.add(String(row.location_id));
    locationsByCleaner.set(row.cleaner_id, set);
  }
  const areaExpanded = expanded ?? (locationId ? [locationId] : null);
  for (const c of cleaners) {
    if (!cleanerAccountEligibleForCustomerBooking(c)) continue;
    if (!cleanerWorksOnScheduledWeekday(c.availability_weekdays, dateYmd)) continue;
    if (!cleanerPassesServiceCapabilityGate(c, capabilityGate)) continue;
    const allowed = locationsByCleaner.get(c.id) ?? new Set<string>();
    const fallback = c.location_id ? String(c.location_id) : null;
    if (cleanerAreasAllowJob(allowed, fallback, areaExpanded)) {
      return "ops_assignment";
    }
  }
  return "area_review";
}

async function fetchAvailableCleanersForSlotGrid(admin: SupabaseClient): Promise<CleanerBase[]> {
  const now = Date.now();
  if (availableCleanersCache && now - availableCleanersCache.at < AVAILABLE_CLEANERS_CACHE_MS) {
    return availableCleanersCache.rows;
  }

  const stripActiveCol = (s: string) => s.replace(", is_active", "");
  const runWith = async (columns: string, requireActiveEq: boolean) => {
    let q = admin.from("cleaners").select(columns).eq("is_available", true);
    if (requireActiveEq) q = q.eq("is_active", true);
    return q;
  };
  let requireActive = true;
  let wd = CLEANERS_LIST_SELECT_WITH_WEEKDAYS;
  let base = CLEANERS_LIST_SELECT_BASE;
  let r = await runWith(wd + CLEANERS_CAPABILITY_SUFFIX, requireActive);
  if (r.error && isUnknownColumnError(r.error, "is_active")) {
    requireActive = false;
    wd = stripActiveCol(CLEANERS_LIST_SELECT_WITH_WEEKDAYS);
    base = stripActiveCol(CLEANERS_LIST_SELECT_BASE);
    r = await runWith(wd + CLEANERS_CAPABILITY_SUFFIX, false);
  }
  if (
    r.error &&
    (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
      isUnknownColumnError(r.error, "can_do_move_cleaning"))
  ) {
    r = await runWith(wd, requireActive);
  }
  if (r.error && isUnknownColumnError(r.error, "availability_weekdays")) {
    r = await runWith(base + CLEANERS_CAPABILITY_SUFFIX, requireActive);
    if (
      r.error &&
      (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
        isUnknownColumnError(r.error, "can_do_move_cleaning"))
    ) {
      r = await runWith(base, requireActive);
    }
  }
  const rows = ((r.data ?? []) as unknown as CleanerBase[]) ?? [];
  availableCleanersCache = { at: now, rows };
  return rows;
}

function sanitizeReviewQuote(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 180);
}

async function fetchRecentPublicReviewsForCleaners(
  admin: SupabaseClient,
  cleanerIds: string[],
): Promise<Map<string, CleanerReviewSnippet[]>> {
  const out = new Map<string, CleanerReviewSnippet[]>();
  for (const id of cleanerIds) out.set(id, []);
  if (cleanerIds.length === 0) return out;

  const rows = await Promise.all(
    cleanerIds.map(async (cleanerId) => {
      const { data, error } = await admin
        .from("reviews")
        .select("rating, comment")
        .eq("cleaner_id", cleanerId)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) return { cleanerId, snippets: [] as CleanerReviewSnippet[] };
      const snippets = (data ?? [])
        .map((r) => {
          const rating = Math.round(Number((r as { rating?: number }).rating));
          const quote = sanitizeReviewQuote(String((r as { comment?: string | null }).comment ?? ""));
          if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
          const displayQuote = quote.length > 0 ? quote : `Rated ${rating}/5.`;
          return { rating, quote: displayQuote };
        })
        .filter((x): x is CleanerReviewSnippet => x != null);
      return { cleanerId, snippets: snippets.slice(0, 3) };
    }),
  );

  for (const row of rows) {
    out.set(row.cleanerId, row.snippets);
  }
  return out;
}

async function fetchAvailabilityForDate(admin: SupabaseClient, selectedDate: string): Promise<CleanerAvailabilityRow[]> {
  const res = await admin
    .from("cleaner_availability")
    .select("cleaner_id, date, start_time, end_time, is_available")
    .eq("date", selectedDate);

  if (res.error) {
    console.error("[availabilityEngine] cleaner_availability query failed:", res.error.message);
    return [];
  }
  return (res.data ?? []) as CleanerAvailabilityRow[];
}

async function fetchCleanerLocationsForIds(
  admin: SupabaseClient,
  cleanerIds: string[],
): Promise<Array<{ cleaner_id: string; location_id: string }>> {
  if (!cleanerIds.length) return [];
  const { data, error } = await admin.from("cleaner_locations").select("cleaner_id, location_id").in("cleaner_id", cleanerIds);
  if (error) {
    console.error("[availabilityEngine] cleaner_locations query failed:", error.message);
    return [];
  }
  return (data ?? []) as Array<{ cleaner_id: string; location_id: string }>;
}

export type GetAvailableCleanersArgs = {
  userLat?: number | null;
  userLng?: number | null;
  selectedDate: string;
  selectedTime: string;
  durationMinutes?: number;
  limit?: number;
  /** When set, skips fetching `cleaner_availability` again (used by slot generator). */
  availabilityRows?: CleanerAvailabilityRow[];
  /** Booking / listing area — required for location-scoped eligibility when set. */
  locationId?: string | null;
  /** When provided, overrides single-id expansion (e.g. city-wide dispatch). */
  locationExpandedIds?: string[] | null;
  /** Catalog service slug for deep/move capability filtering (`getEligibleCleaners`). */
  bookingServiceSlug?: string | null;
  serviceLabelForCapability?: string | null;
};

export async function getAvailableCleaners(
  admin: SupabaseClient,
  args: GetAvailableCleanersArgs,
): Promise<AvailableCleaner[]> {
  const durationMinutes = args.durationMinutes ?? 120;
  const limit = args.limit ?? 5;
  const loc = (args.locationId ?? "").trim();
  const expanded =
    args.locationExpandedIds !== undefined
      ? args.locationExpandedIds
      : loc
        ? [loc]
        : null;

  let availRows: CleanerAvailabilityRow[];
  if (args.availabilityRows != null) {
    availRows = args.availabilityRows;
  } else {
    availRows = await fetchAvailabilityForDate(admin, args.selectedDate);
  }

  let cleanersRaw: CleanerBase[] | null = null;
  let cErr = null as { message?: string } | null;
  {
    const stripActiveCol = (s: string) => s.replace(", is_active", "");
    const runWith = async (columns: string, requireActiveEq: boolean) => {
      let q = admin.from("cleaners").select(columns).eq("is_available", true);
      if (requireActiveEq) q = q.eq("is_active", true);
      return q;
    };
    let requireActive = true;
    let wd = CLEANERS_LIST_SELECT_WITH_WEEKDAYS;
    let base = CLEANERS_LIST_SELECT_BASE;
    let r = await runWith(wd + CLEANERS_CAPABILITY_SUFFIX, requireActive);
    if (r.error && isUnknownColumnError(r.error, "is_active")) {
      requireActive = false;
      wd = stripActiveCol(CLEANERS_LIST_SELECT_WITH_WEEKDAYS);
      base = stripActiveCol(CLEANERS_LIST_SELECT_BASE);
      r = await runWith(wd + CLEANERS_CAPABILITY_SUFFIX, false);
    }
    if (
      r.error &&
      (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
        isUnknownColumnError(r.error, "can_do_move_cleaning"))
    ) {
      r = await runWith(wd, requireActive);
    }
    if (r.error && isUnknownColumnError(r.error, "availability_weekdays")) {
      r = await runWith(base + CLEANERS_CAPABILITY_SUFFIX, requireActive);
      if (
        r.error &&
        (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
          isUnknownColumnError(r.error, "can_do_move_cleaning"))
      ) {
        r = await runWith(base, requireActive);
      }
    }
    cleanersRaw = (r.data ?? null) as unknown as CleanerBase[] | null;
    cErr = r.error;
  }

  if (cErr || !cleanersRaw?.length) {
    if (cErr) console.error("[availabilityEngine] cleaners query failed:", cErr.message);
    return [];
  }

  const preloadedCleaners = ((cleanersRaw ?? []) as CleanerBase[]).filter((c) =>
    cleanerAccountEligibleForCustomerBooking(c),
  );
  if (!preloadedCleaners.length) return [];
  const ids = preloadedCleaners.map((c) => c.id);
  const preloadedLocs = await fetchCleanerLocationsForIds(admin, ids);

  const cleaners = await getEligibleCleaners(admin, {
    date: args.selectedDate,
    startTime: args.selectedTime,
    durationMinutes,
    locationId: loc || "",
    locationExpandedIds: expanded,
    userLat: args.userLat,
    userLng: args.userLng,
    limit,
    preloadedCleaners,
    preloadedAvailability: availRows,
    preloadedCleanerLocations: preloadedLocs,
    serviceType: args.bookingServiceSlug ?? null,
    serviceLabelForCapability: args.serviceLabelForCapability ?? null,
    enforcePublicDailyWorkloadLimit: maxCleanerDailyWorkloadEnforcePublic(),
  });

  const sliced = cleaners.slice(0, limit);
  const recentByCleaner = await fetchRecentPublicReviewsForCleaners(
    admin,
    sliced.map((c) => c.id),
  );
  return sliced.map((c) => ({
    ...c,
    recent_reviews: recentByCleaner.get(c.id) ?? [],
  }));
}

/** Canonical single-cleaner check; avoids loading review snippets and large pools. */
export async function isCleanerEligibleForBookingSlot(
  admin: SupabaseClient,
  args: {
    cleanerId: string;
    selectedDate: string;
    selectedTime: string;
    durationMinutes?: number;
    locationId?: string | null;
    locationExpandedIds?: string[] | null;
    bookingServiceSlug?: string | null;
    serviceLabelForCapability?: string | null;
  },
): Promise<boolean> {
  const loc = (args.locationId ?? "").trim();
  const expanded =
    args.locationExpandedIds !== undefined
      ? args.locationExpandedIds
      : loc
        ? [loc]
        : null;
  const rows = await getEligibleCleaners(admin, {
    date: args.selectedDate,
    startTime: args.selectedTime,
    durationMinutes: args.durationMinutes ?? 120,
    locationId: loc || "",
    locationExpandedIds: expanded,
    userLat: null,
    userLng: null,
    limit: 1,
    cleanerIds: [args.cleanerId],
    serviceType: args.bookingServiceSlug ?? null,
    serviceLabelForCapability: args.serviceLabelForCapability ?? null,
  });
  return rows.length > 0 && rows[0]!.id === args.cleanerId;
}

export async function isCleanerInAvailablePoolForSlot(
  admin: SupabaseClient,
  args: {
    cleanerId: string;
    selectedDate: string;
    selectedTime: string;
    durationMinutes?: number;
    locationId?: string | null;
    locationExpandedIds?: string[] | null;
    bookingServiceSlug?: string | null;
    serviceLabelForCapability?: string | null;
  },
): Promise<boolean> {
  return isCleanerEligibleForBookingSlot(admin, args);
}

export type TimeSlotAvailabilityRow = {
  time: string;
  available: boolean;
  cleanersCount: number;
  locationId: string | null;
  /** Instant-eligible cleaners for the slot. */
  availableInstant: boolean;
  fulfillmentMode: "instant" | "ops_assignment" | "area_review";
};

export async function getAvailableTimeSlots(
  admin: SupabaseClient,
  args: {
    selectedDate: string;
    durationMinutes: number;
    userLat?: number | null;
    userLng?: number | null;
    startHour?: number;
    endHour?: number;
    stepMinutes?: number;
    locationId?: string | null;
    locationExpandedIds?: string[] | null;
    bookingServiceSlug?: string | null;
    serviceLabelForCapability?: string | null;
  },
): Promise<TimeSlotAvailabilityRow[]> {
  const startHour = args.startHour ?? 7;
  const endHour = args.endHour ?? 18;
  const stepMinutes = args.stepMinutes ?? 30;
  const out: TimeSlotAvailabilityRow[] = [];
  const soft = isBookingSoftFulfillmentEnabled();

  try {
    const loc = (args.locationId ?? "").trim();
    const expanded =
      args.locationExpandedIds !== undefined
        ? args.locationExpandedIds
        : loc
          ? [loc]
          : null;
    const jobDurationMinutes = Math.max(30, Math.round(args.durationMinutes));

    // Wave 1 — independent reads in parallel (was sequential before).
    const [availabilityRows, preloadedCleaners] = await Promise.all([
      fetchAvailabilityForDate(admin, args.selectedDate),
      fetchAvailableCleanersForSlotGrid(admin),
    ]);

    const cleanerIds = preloadedCleaners.map((c) => c.id);
    const needPrefs = Boolean((args.bookingServiceSlug ?? "").trim());

    // Wave 2 — dependent on cleaner ids; still one round-trip set.
    const [preloadedLocs, preloadedOccupyingBookings, preloadedCleanerPreferences] = await Promise.all([
      fetchCleanerLocationsForIds(admin, cleanerIds),
      fetchOccupyingBookingsForDate(admin, args.selectedDate),
      needPrefs
        ? fetchCleanerPreferencesByCleanerIds(admin, cleanerIds)
        : Promise.resolve(new Map()),
    ]);

    const dayFulfillmentFallback: BookingFulfillmentMode =
      soft && loc
        ? softDayFulfillmentFromPreloadedPool(
            preloadedCleaners,
            preloadedLocs,
            args.selectedDate,
            expanded,
            loc,
            args.bookingServiceSlug ?? null,
            args.serviceLabelForCapability ?? null,
          )
        : "area_review";

    const slotTimes: string[] = [];
    for (let mins = startHour * 60; mins <= endHour * 60; mins += stepMinutes) {
      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      slotTimes.push(`${hh}:${mm}`);
    }

    const slotRows = await Promise.all(
      slotTimes.map(async (time) => {
        const mins = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
        const slotDurationMinutes = bookingSlotEligibilityDurationMinutes(mins, jobDurationMinutes);
        if (slotDurationMinutes == null) {
          return {
            time,
            available: false,
            cleanersCount: 0,
            locationId: loc ? loc : null,
            availableInstant: false,
            fulfillmentMode: "instant" as const,
          } satisfies TimeSlotAvailabilityRow;
        }

        const cleaners = await getEligibleCleaners(admin, {
          date: args.selectedDate,
          startTime: time,
          durationMinutes: slotDurationMinutes,
          locationId: loc || "",
          locationExpandedIds: expanded,
          userLat: args.userLat,
          userLng: args.userLng,
          limit: 50,
          preloadedCleaners,
          preloadedAvailability: availabilityRows,
          preloadedCleanerLocations: preloadedLocs,
          preloadedOccupyingBookings,
          preloadedCleanerPreferences,
          serviceType: args.bookingServiceSlug ?? null,
          serviceLabelForCapability: args.serviceLabelForCapability ?? null,
          enforcePublicDailyWorkloadLimit: maxCleanerDailyWorkloadEnforcePublic(),
        });

        const instant = cleaners.length > 0;
        const fulfillmentMode: BookingFulfillmentMode = instant
          ? "instant"
          : soft
            ? dayFulfillmentFallback
            : "instant";
        const available = instant || (soft && Boolean(loc));

        return {
          time,
          available,
          cleanersCount: cleaners.length,
          locationId: loc ? loc : null,
          availableInstant: instant,
          fulfillmentMode,
        } satisfies TimeSlotAvailabilityRow;
      }),
    );
    out.push(...slotRows);
  } catch (e) {
    console.error("[availabilityEngine] getAvailableTimeSlots failed:", e);
    return [];
  }

  return out;
}
