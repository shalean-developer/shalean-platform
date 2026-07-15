"use client";

import { useEffect, useRef, useState } from "react";

type ResolvedLocation = {
  locationId: string;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
};

const UNSUPPORTED_OTHER_MESSAGE =
  "We don’t currently list that area for instant online booking. Choose a nearby supported suburb, or contact us to check coverage.";

/**
 * Resolves a suburb label to a canonical `locations.id`.
 * Does not surface errors while a request is in flight (avoids premature red text).
 */
export function useBookingV2LocationResolve(suburb: string): {
  location: ResolvedLocation | null;
  loading: boolean;
  error: string | null;
} {
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGen = useRef(0);

  useEffect(() => {
    const label = suburb.trim();
    if (label.length < 2) {
      setLocation(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (label.toLowerCase() === "other") {
      setLocation(null);
      setLoading(false);
      setError(UNSUPPORTED_OTHER_MESSAGE);
      return;
    }

    const ac = new AbortController();
    const gen = ++requestGen.current;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
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
          if (ac.signal.aborted || gen !== requestGen.current) return;
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
          if (ac.signal.aborted || gen !== requestGen.current) return;
          setLocation(null);
          setError("Could not verify service area. Please try again.");
        } finally {
          if (!ac.signal.aborted && gen === requestGen.current) setLoading(false);
        }
      })();
    }, 150);

    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [suburb]);

  return { location, loading, error };
}
