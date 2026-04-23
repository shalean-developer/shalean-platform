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
  distance_km: number | null;
  is_available: boolean;
};

const cache = new Map<string, LiveCleaner[]>();

export function useCleaners(args: {
  userLat?: number | null;
  userLng?: number | null;
  selectedDate?: string | null;
  selectedTime?: string | null;
  /** Must match slot grid / lock job length (minutes). */
  durationMinutes?: number;
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
      JSON.stringify({
        date: args.selectedDate ?? "",
        time: args.selectedTime ?? "",
        lat: args.userLat ?? null,
        lng: args.userLng ?? null,
        duration: durationMinutes,
      }),
    [args.selectedDate, args.selectedTime, args.userLat, args.userLng, durationMinutes],
  );

  useEffect(() => {
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
        const res = await fetch(`/api/booking/cleaners?${params.toString()}`);
        const json = (await res.json()) as { cleaners?: LiveCleaner[]; error?: string };
        if (!active) return;
        if (!res.ok) {
          setError(json.error ?? "Failed to load cleaners.");
          setCleaners([]);
          return;
        }
        const next = json.cleaners ?? [];
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
  }, [args.selectedDate, args.selectedTime, args.userLat, args.userLng, durationMinutes, key]);

  const recommendedCleaner = cleaners[0] ?? null;
  return { cleaners, recommendedCleaner, loading, error };
}
