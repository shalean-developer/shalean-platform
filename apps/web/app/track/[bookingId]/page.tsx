"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/hooks/useUser";
import { BookingLiveMapEmbed } from "@/components/tracking/BookingLiveMapEmbed";
import {
  deriveBookingOperationalPhase,
  isAuthoritativeBookingCompleted,
  type PhaseRow,
} from "@/lib/booking/deriveBookingOperationalPhase";

type Gate = "loading" | "sign_in" | "forbidden" | "not_found" | "ok";

export default function CustomerTrackBookingPage() {
  const params = useParams();
  const bookingId = typeof params.bookingId === "string" ? params.bookingId : "";
  const { user, loading: userLoading } = useUser();
  const [gate, setGate] = useState<Gate>("loading");
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [phaseRow, setPhaseRow] = useState<PhaseRow | null>(null);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!bookingId) {
      queueMicrotask(() => setGate("not_found"));
      return;
    }
    if (userLoading) {
      queueMicrotask(() => setGate("loading"));
      return;
    }
    if (!user) {
      queueMicrotask(() => setGate("sign_in"));
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      queueMicrotask(() => setGate("not_found"));
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await sb
        .from("bookings")
        .select(
          "id, user_id, location, status, cleaner_response_status, en_route_at, started_at, completed_at, dispatch_status, is_recurring_generated, billing_type, monthly_invoice_id",
        )
        .eq("id", bookingId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setGate("not_found");
        return;
      }
      const row = data as Record<string, unknown>;
      if (String(row.user_id ?? "").trim() !== user.id) {
        setGate("forbidden");
        return;
      }
      setLocationLabel(typeof row.location === "string" ? row.location : null);
      const pr: PhaseRow = {
        status: row.status != null ? String(row.status) : null,
        cleaner_response_status: row.cleaner_response_status != null ? String(row.cleaner_response_status) : null,
        en_route_at: row.en_route_at != null ? String(row.en_route_at) : null,
        started_at: row.started_at != null ? String(row.started_at) : null,
        completed_at: row.completed_at != null ? String(row.completed_at) : null,
        dispatch_status: row.dispatch_status != null ? String(row.dispatch_status) : null,
        is_recurring_generated:
          row.is_recurring_generated === true || row.is_recurring_generated === false ? row.is_recurring_generated : null,
        billing_type: row.billing_type != null ? String(row.billing_type) : null,
        monthly_invoice_id: row.monthly_invoice_id != null ? String(row.monthly_invoice_id) : null,
      };
      setPhaseRow(pr);
      setGate("ok");

      const phase = deriveBookingOperationalPhase(pr);
      const trackable =
        !isAuthoritativeBookingCompleted(pr) && (phase === "travelling" || phase === "active");
      if (!trackable) return;

      const { data: last } = await sb
        .from("cleaner_booking_track_points")
        .select("lat, lng")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (last) {
        const lat = Number((last as { lat?: unknown }).lat);
        const lng = Number((last as { lng?: unknown }).lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setPoint({ lat, lng });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingId, user, userLoading]);

  const trackable =
    phaseRow != null &&
    !isAuthoritativeBookingCompleted(phaseRow) &&
    (() => {
      const ph = deriveBookingOperationalPhase(phaseRow);
      return ph === "travelling" || ph === "active";
    })();

  useEffect(() => {
    if (gate !== "ok" || !bookingId || !user || !trackable) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    const ch = sb
      .channel(`customer-track-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cleaner_booking_track_points",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const n = payload.new as Record<string, unknown>;
          const lat = Number(n.lat);
          const lng = Number(n.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) setPoint({ lat, lng });
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(ch);
    };
  }, [gate, bookingId, user, trackable]);

  if (!bookingId) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm text-zinc-600">
        <p>Missing booking.</p>
        <Link href="/" className="mt-3 inline-block text-blue-600 hover:underline">
          Home
        </Link>
      </div>
    );
  }

  if (gate === "loading" || userLoading) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-zinc-500">
        <p>Loading…</p>
      </div>
    );
  }

  if (gate === "sign_in") {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="text-lg font-semibold text-zinc-900">Track your cleaner</h1>
        <p className="text-sm text-zinc-600">Sign in to see live location for this booking.</p>
        <Link
          href={`/auth?redirect=${encodeURIComponent(`/track/${encodeURIComponent(bookingId)}`)}`}
          className="inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (gate === "forbidden" || gate === "not_found") {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm text-zinc-600">
        <p>{gate === "forbidden" ? "You don’t have access to this booking." : "Booking not found."}</p>
        <Link href="/" className="mt-3 inline-block text-blue-600 hover:underline">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Live tracking</h1>
      {locationLabel ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Job address:</span> {locationLabel}
        </p>
      ) : null}
      {!trackable ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Live map appears when your cleaner is on the way or the job is in progress.
        </p>
      ) : !point ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Waiting for the cleaner’s location…</p>
      ) : (
        <BookingLiveMapEmbed lat={point.lat} lng={point.lng} label="Cleaner location" />
      )}
      <Link href="/" className="inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
        Back to home
      </Link>
    </div>
  );
}
