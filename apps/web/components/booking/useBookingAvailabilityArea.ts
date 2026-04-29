"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ResolvedBookingArea = {
  locationId: string | null;
  cityId: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolves `locations.id` + `city_id` for availability and cleaner APIs.
 * Prefers structured suburb ids from step 1.
 * When {@link allowFreeTextFallback} is false (main funnel), free-text `location` is never sent to `/api/booking/resolve-location`.
 */
export function useBookingAvailabilityArea(args: {
  serviceAreaLocationId?: string | null;
  serviceAreaCityId?: string | null;
  locationLabel?: string | null;
  /** Legacy/widget only: debounce-resolve free-text `location` when no structured suburb. */
  allowFreeTextFallback?: boolean;
}): ResolvedBookingArea {
  const structuredResolved = useMemo((): ResolvedBookingArea | null => {
    const id =
      typeof args.serviceAreaLocationId === "string" ? args.serviceAreaLocationId.trim().toLowerCase() : "";
    if (!id || !UUID_RE.test(id)) return null;
    const cid =
      typeof args.serviceAreaCityId === "string" ? args.serviceAreaCityId.trim().toLowerCase() : "";
    return {
      locationId: id,
      cityId: cid && UUID_RE.test(cid) ? cid : null,
    };
  }, [args.serviceAreaLocationId, args.serviceAreaCityId]);

  const [fallback, setFallback] = useState<ResolvedBookingArea>({ locationId: null, cityId: null });
  const seqRef = useRef(0);

  useEffect(() => {
    if (structuredResolved) {
      seqRef.current += 1;
      queueMicrotask(() => setFallback({ locationId: null, cityId: null }));
      return;
    }

    if (!args.allowFreeTextFallback) {
      seqRef.current += 1;
      queueMicrotask(() => setFallback({ locationId: null, cityId: null }));
      return;
    }

    const label = typeof args.locationLabel === "string" ? args.locationLabel.trim() : "";
    if (!label) {
      seqRef.current += 1;
      queueMicrotask(() => setFallback({ locationId: null, cityId: null }));
      return;
    }

    const mySeq = ++seqRef.current;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const qs = new URLSearchParams({ label });
          const res = await fetch(`/api/booking/resolve-location?${qs.toString()}`);
          const json = (await res.json()) as {
            ok?: boolean;
            locationId?: string | null;
            cityId?: string | null;
          };
          if (mySeq !== seqRef.current) return;
          if (json?.ok === true) {
            setFallback({
              locationId:
                typeof json.locationId === "string" && json.locationId.trim() ? json.locationId.trim() : null,
              cityId: typeof json.cityId === "string" && json.cityId.trim() ? json.cityId.trim() : null,
            });
          } else {
            setFallback({ locationId: null, cityId: null });
          }
        } catch {
          if (mySeq === seqRef.current) setFallback({ locationId: null, cityId: null });
        }
      })();
    }, 400);
    return () => {
      window.clearTimeout(t);
    };
  }, [structuredResolved, args.allowFreeTextFallback, args.locationLabel]);

  return structuredResolved ?? fallback;
}

