/**
 * Cleaner availability and slot windows only — no ZAR pricing (see `lib/pricing/pricingEngine.ts`).
 * Eligibility rules live in {@link getEligibleCleaners}.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailableCleaner, CleanerAvailabilityRow, CleanerReviewSnippet } from "@/lib/booking/cleanerPoolTypes";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";

export type { AvailableCleaner, CleanerReviewSnippet, CleanerAvailabilityRow } from "@/lib/booking/cleanerPoolTypes";

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
    .eq("date", selectedDate)
    .eq("is_available", true);

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

  const { data: cleanersRaw, error: cErr } = await admin
    .from("cleaners")
    .select(
      "id, full_name, phone, email, rating, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status",
    )
    .eq("is_available", true)
    .neq("status", "offline");

  if (cErr || !cleanersRaw?.length) {
    if (cErr) console.error("[availabilityEngine] cleaners query failed:", cErr.message);
    return [];
  }

  const preloadedCleaners = cleanersRaw as import("@/lib/booking/getEligibleCleaners").CleanerBase[];
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

export async function isCleanerInAvailablePoolForSlot(
  admin: SupabaseClient,
  args: {
    cleanerId: string;
    selectedDate: string;
    selectedTime: string;
    durationMinutes?: number;
    locationId?: string | null;
    locationExpandedIds?: string[] | null;
  },
): Promise<boolean> {
  const pool = await getAvailableCleaners(admin, {
    selectedDate: args.selectedDate,
    selectedTime: args.selectedTime,
    durationMinutes: args.durationMinutes ?? 120,
    limit: 500,
    locationId: args.locationId,
    locationExpandedIds: args.locationExpandedIds,
  });
  return pool.some((c) => c.id === args.cleanerId);
}

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
  },
): Promise<Array<{ time: string; available: boolean; cleanersCount: number; locationId: string | null }>> {
  const startHour = args.startHour ?? 7;
  const endHour = args.endHour ?? 18;
  const stepMinutes = args.stepMinutes ?? 30;
  const out: Array<{ time: string; available: boolean; cleanersCount: number; locationId: string | null }> = [];

  try {
    const availabilityRows = await fetchAvailabilityForDate(admin, args.selectedDate);

    const { data: cleanersRaw } = await admin
      .from("cleaners")
      .select(
        "id, full_name, phone, email, rating, is_available, jobs_completed, review_count, home_lat, home_lng, latitude, longitude, location_id, status",
      )
      .eq("is_available", true)
      .neq("status", "offline");

    const preloadedCleaners = (cleanersRaw ?? []) as import("@/lib/booking/getEligibleCleaners").CleanerBase[];
    const preloadedLocs = await fetchCleanerLocationsForIds(
      admin,
      preloadedCleaners.map((c) => c.id),
    );

    const loc = (args.locationId ?? "").trim();
    const expanded =
      args.locationExpandedIds !== undefined
        ? args.locationExpandedIds
        : loc
          ? [loc]
          : null;

    for (let mins = startHour * 60; mins <= endHour * 60; mins += stepMinutes) {
      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      const time = `${hh}:${mm}`;

      const cleaners = await getEligibleCleaners(admin, {
        date: args.selectedDate,
        startTime: time,
        durationMinutes: args.durationMinutes,
        locationId: loc || "",
        locationExpandedIds: expanded,
        userLat: args.userLat,
        userLng: args.userLng,
        limit: 50,
        preloadedCleaners,
        preloadedAvailability: availabilityRows,
        preloadedCleanerLocations: preloadedLocs,
      });

      out.push({
        time,
        available: cleaners.length > 0,
        cleanersCount: cleaners.length,
        locationId: loc ? loc : null,
      });
    }
  } catch (e) {
    console.error("[availabilityEngine] getAvailableTimeSlots failed:", e);
    return [];
  }

  return out;
}
