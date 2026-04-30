"use client";

import { useCallback, useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { BookingLiveMapEmbed } from "@/components/tracking/BookingLiveMapEmbed";

type Point = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  created_at: string | null;
};

function parsePoint(j: unknown): Point | null {
  if (!j || typeof j !== "object") return null;
  const p = j as Record<string, unknown>;
  const lat = typeof p.lat === "number" ? p.lat : Number(p.lat);
  const lng = typeof p.lng === "number" ? p.lng : Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    heading: typeof p.heading === "number" && Number.isFinite(p.heading) ? p.heading : null,
    speed: typeof p.speed === "number" && Number.isFinite(p.speed) ? p.speed : null,
    created_at: typeof p.created_at === "string" ? p.created_at : null,
  };
}

/** Polls latest GPS every 8s (admin uses service-role API; track-points RLS is cleaner/customer only). */
export function AdminBookingLiveLocation({
  bookingId,
  status,
  cleanerResponseStatus,
  cleanerId,
}: {
  bookingId: string;
  status: string | null;
  cleanerResponseStatus: string | null;
  cleanerId: string | null;
}) {
  const crs = (cleanerResponseStatus ?? "").toLowerCase();
  const st = (status ?? "").toLowerCase();
  const show = Boolean(cleanerId) && (crs === "on_my_way" || st === "in_progress");

  const [point, setPoint] = useState<Point | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/track/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json()) as { point?: unknown; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Could not load location.");
        return;
      }
      setErr(null);
      const p = j.point ? parsePoint(j.point) : null;
      setPoint(p);
    } catch {
      setErr("Network error.");
    }
  }, [bookingId]);

  useEffect(() => {
    if (!show) {
      queueMicrotask(() => {
        setPoint(null);
        setErr(null);
      });
      return;
    }
    const boot = window.setTimeout(() => void loadLatest(), 0);
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadLatest();
    }, 8_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(id);
    };
  }, [show, loadLatest]);

  if (!show) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <Navigation className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
        Live cleaner location
      </div>
      {err ? <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">{err}</p> : null}
      {!point ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {crs === "on_my_way"
            ? "Waiting for the cleaner’s device to share location…"
            : "No GPS samples yet for this visit."}
        </p>
      ) : (
        <>
          <BookingLiveMapEmbed lat={point.lat} lng={point.lng} label="Cleaner live location" />
          {point.created_at ? (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Updated {new Date(point.created_at).toLocaleString()}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
