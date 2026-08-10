"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useCleanerLiveLocationSender } from "@/hooks/useCleanerLiveLocationSender";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

const STATUS_REFRESH_MS = 15_000;

export function cleanerJobIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/cleaner\/jobs\/([^/?#]+)\/?$/);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return null;
  }
}

export function shouldSendCleanerLiveLocation(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === CLEANER_RESPONSE.ON_MY_WAY;
}

/**
 * Route-level bridge for cleaner live tracking.
 *
 * The job detail screen already owns lifecycle controls, while the existing
 * `useCleanerLiveLocationSender` owns browser geolocation + throttled posting.
 * This bridge keeps those concerns separate: it enables that sender only on a
 * cleaner job-detail route whose server state is `on_my_way`.
 */
export function CleanerLiveLocationBridge() {
  const pathname = usePathname();
  const bookingId = useMemo(() => cleanerJobIdFromPathname(pathname), [pathname]);
  const [enabled, setEnabled] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!bookingId) {
      setEnabled(false);
      return;
    }

    const refresh = async () => {
      try {
        const headers = await getCleanerAuthHeaders();
        if (!headers || cancelled) {
          if (!cancelled) setEnabled(false);
          return;
        }
        const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}`, {
          headers,
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          job?: { cleaner_response_status?: unknown };
        };
        if (!cancelled) {
          setEnabled(res.ok && shouldSendCleanerLiveLocation(body.job?.cleaner_response_status));
        }
      } catch {
        if (!cancelled) setEnabled(false);
      } finally {
        if (!cancelled) timer = setTimeout(refresh, STATUS_REFRESH_MS);
      }
    };

    setEnabled(false);
    void refresh();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [bookingId]);

  useCleanerLiveLocationSender({ bookingId, enabled, online });
  return null;
}
