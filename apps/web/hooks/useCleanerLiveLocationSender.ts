"use client";

import { useEffect, useRef } from "react";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";

const DEFAULT_MIN_INTERVAL_MS = 8_000;

/**
 * Posts GPS to `/api/cleaner/location/update` on an interval while `enabled` (caller: on_my_way only).
 * Uses `watchPosition` but throttles network to ~every {@link DEFAULT_MIN_INTERVAL_MS}.
 */
export function useCleanerLiveLocationSender(opts: {
  bookingId: string | null;
  enabled: boolean;
  online?: boolean;
  minIntervalMs?: number;
}) {
  const { bookingId, enabled, online = true, minIntervalMs = DEFAULT_MIN_INTERVAL_MS } = opts;
  const lastPostAt = useRef(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!bookingId || !enabled || !online) {
      if (watchId.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const post = async (pos: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastPostAt.current < minIntervalMs) return;
      lastPostAt.current = now;
      const headers = await getCleanerAuthHeaders();
      if (!headers) return;
      const c = pos.coords;
      const lat = c.latitude;
      const lng = c.longitude;
      const body: Record<string, unknown> = { bookingId, lat, lng };
      if (typeof c.heading === "number" && Number.isFinite(c.heading)) body.heading = c.heading;
      if (typeof c.speed === "number" && Number.isFinite(c.speed)) body.speed = c.speed;
      try {
        await cleanerAuthenticatedFetch("/api/cleaner/location/update", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        /* ignore transient network */
      }
    };

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        void post(pos);
      },
      () => {
        /* permission denied or unavailable — silent */
      },
      { enableHighAccuracy: true, maximumAge: minIntervalMs, timeout: 20_000 },
    );

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [bookingId, enabled, online, minIntervalMs]);
}
