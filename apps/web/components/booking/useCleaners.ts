"use client";

import { useEffect, useMemo, useState } from "react";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

export type LiveCleaner = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  rating: number;
  jobs_completed: number;
  review_count: number;
  /** Public snippets from `reviews` (non-hidden), max 3. */
  recent_reviews: { rating: number; quote: string }[];
  distance_km: number | null;
  is_available: boolean;
  /** Optional; forwarded from API when present — client-only display. */
  price_delta_zar?: number | null;
};

const cache = new Map<string, LiveCleaner[]>();

function cleanersCacheKey(args: {
  selectedDate: string;
  selectedTime: string;
  durationMinutes: number;
  userLat?: number | null;
  userLng?: number | null;
  locationId?: string | null;
}): string {
  return JSON.stringify({
    date: args.selectedDate,
    time: args.selectedTime,
    lat: args.userLat ?? null,
    lng: args.userLng ?? null,
    duration: args.durationMinutes,
    locationId: typeof args.locationId === "string" ? args.locationId.trim() : "",
  });
}

/**
 * Warms the same in-memory cache as {@link useCleaners} so the cleaner step feels instant after slot pick.
 */
export async function prefetchBookingCleaners(args: {
  selectedDate: string;
  selectedTime: string;
  durationMinutes?: number;
  userLat?: number | null;
  userLng?: number | null;
  locationId?: string | null;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const durationMinutes =
    typeof args.durationMinutes === "number" && Number.isFinite(args.durationMinutes)
      ? Math.max(30, Math.round(args.durationMinutes))
      : 120;
  const key = cleanersCacheKey({
    selectedDate: args.selectedDate,
    selectedTime: args.selectedTime,
    durationMinutes,
    userLat: args.userLat,
    userLng: args.userLng,
    locationId: args.locationId,
  });
  if (cache.has(key)) return;
  try {
    const params = new URLSearchParams({
      date: args.selectedDate,
      time: args.selectedTime,
      duration: String(durationMinutes),
    });
    if (typeof args.userLat === "number") params.set("lat", String(args.userLat));
    if (typeof args.userLng === "number") params.set("lng", String(args.userLng));
    const loc = typeof args.locationId === "string" ? args.locationId.trim() : "";
    if (loc) params.set("locationId", loc);
    const res = await fetch(`/api/booking/cleaners?${params.toString()}`);
    const json = (await res.json()) as { cleaners?: LiveCleaner[]; error?: string };
    if (!res.ok) return;
    const raw = json.cleaners ?? [];
    const next: LiveCleaner[] = raw.map((c) => {
      const dz = (c as { price_delta_zar?: unknown }).price_delta_zar;
      return {
        ...c,
        review_count: typeof c.review_count === "number" && Number.isFinite(c.review_count) ? Math.max(0, Math.round(c.review_count)) : 0,
        recent_reviews: Array.isArray((c as { recent_reviews?: unknown }).recent_reviews)
          ? ((c as { recent_reviews: { rating?: unknown; quote?: unknown }[] }).recent_reviews ?? [])
              .map((r) => ({
                rating: Math.round(Number(r.rating)),
                quote: typeof r.quote === "string" ? r.quote : "",
              }))
              .filter((r) => Number.isFinite(r.rating) && r.quote.length > 0)
              .slice(0, 3)
          : [],
        ...(typeof dz === "number" && Number.isFinite(dz) ? { price_delta_zar: Math.round(dz) } : {}),
      };
    });
    cache.set(key, next);
  } catch {
    /* ignore prefetch failures */
  }
}

export function useCleaners(args: {
  userLat?: number | null;
  userLng?: number | null;
  selectedDate?: string | null;
  selectedTime?: string | null;
  /** Must match slot grid / lock job length (minutes). */
  durationMinutes?: number;
  /** Resolved `locations.id` from step-1 area — required for strict availability alignment. */
  locationId?: string | null;
  /** When false, skips fetch and clears state (e.g. team-assigned services). */
  enabled?: boolean;
}) {
  const [cleaners, setCleaners] = useState<LiveCleaner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const durationMinutes =
    typeof args.durationMinutes === "number" && Number.isFinite(args.durationMinutes)
      ? Math.max(30, Math.round(args.durationMinutes))
      : 120;

  const key = useMemo(
    () =>
      cleanersCacheKey({
        selectedDate: args.selectedDate ?? "",
        selectedTime: args.selectedTime ?? "",
        durationMinutes,
        userLat: args.userLat,
        userLng: args.userLng,
        locationId: args.locationId,
      }),
    [args.selectedDate, args.selectedTime, args.userLat, args.userLng, durationMinutes, args.locationId],
  );

  useEffect(() => {
    if (args.enabled === false) {
      queueMicrotask(() => {
        setCleaners([]);
        setError(null);
        setLoading(false);
      });
      return;
    }
    if (!args.selectedDate || !args.selectedTime) {
      queueMicrotask(() => {
        setCleaners([]);
        setError(null);
        setLoading(false);
      });
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      queueMicrotask(() => {
        setCleaners(cached);
        setError(null);
        setLoading(false);
      });
      return;
    }
    let active = true;
    const t = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          date: args.selectedDate!,
          time: args.selectedTime!,
          duration: String(durationMinutes),
        });
        if (typeof args.userLat === "number") params.set("lat", String(args.userLat));
        if (typeof args.userLng === "number") params.set("lng", String(args.userLng));
        const loc = typeof args.locationId === "string" ? args.locationId.trim() : "";
        if (loc) params.set("locationId", loc);
        const res = await fetch(`/api/booking/cleaners?${params.toString()}`);
        const json = (await res.json()) as { cleaners?: LiveCleaner[]; error?: string };
        if (!active) return;
        if (!res.ok) {
          setError(json.error ?? "Failed to load cleaners.");
          setCleaners([]);
          return;
        }
        const raw = json.cleaners ?? [];
        const next: LiveCleaner[] = raw.map((c) => {
          const dz = (c as { price_delta_zar?: unknown }).price_delta_zar;
          return {
            ...c,
            review_count: typeof c.review_count === "number" && Number.isFinite(c.review_count) ? Math.max(0, Math.round(c.review_count)) : 0,
            recent_reviews: Array.isArray((c as { recent_reviews?: unknown }).recent_reviews)
              ? ((c as { recent_reviews: { rating?: unknown; quote?: unknown }[] }).recent_reviews ?? [])
                  .map((r) => ({
                    rating: Math.round(Number(r.rating)),
                    quote: typeof r.quote === "string" ? r.quote : "",
                  }))
                  .filter((r) => Number.isFinite(r.rating) && r.quote.length > 0)
                  .slice(0, 3)
              : [],
            ...(typeof dz === "number" && Number.isFinite(dz) ? { price_delta_zar: Math.round(dz) } : {}),
          };
        });
        cache.set(key, next);
        setCleaners(next);
        trackGrowthEvent("cleaners_loaded", {
          cleanersCount: next.length,
          selectedTime: args.selectedTime,
        });
      } catch {
        if (!active) return;
        setError("Network error loading cleaners.");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [args.enabled, args.selectedDate, args.selectedTime, args.userLat, args.userLng, args.locationId, durationMinutes, key]);

  const recommendedCleaner = cleaners[0] ?? null;
  return { cleaners, recommendedCleaner, loading, error };
}
