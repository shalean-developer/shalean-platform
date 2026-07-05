"use client";

import { useEffect, useState } from "react";

type ResolvedLocation = {
  locationId: string;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function useBookingV2LocationResolve(suburb: string): {
  location: ResolvedLocation | null;
  loading: boolean;
  error: string | null;
} {
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const label = suburb.trim();
    if (label.length < 2) {
      setLocation(null);
      setLoading(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/booking-v2/resolve-location?${new URLSearchParams({ suburb: label }).toString()}`,
          { signal: ac.signal },
        );
        const json = (await res.json()) as {
          ok?: boolean;
          locationId?: string;
          cityId?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          error?: string;
        };
        if (ac.signal.aborted) return;
        if (!res.ok || !json.ok || !json.locationId) {
          setLocation(null);
          setError(json.error ?? "Could not verify service area for this suburb.");
          return;
        }
        setLocation({
          locationId: json.locationId,
          cityId: json.cityId ?? null,
          latitude: json.latitude ?? null,
          longitude: json.longitude ?? null,
        });
        setError(null);
      } catch {
        if (ac.signal.aborted) return;
        setLocation(null);
        setError("Could not verify service area. Please try again.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [suburb]);

  return { location, loading, error };
}
