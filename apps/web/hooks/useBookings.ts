"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import type { BookingRow, DashboardBooking } from "@/lib/dashboard/types";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

const BOOKING_SELECT = [
  "id",
  "service",
  "date",
  "time",
  "location",
  "total_paid_zar",
  "total_price",
  "price_breakdown",
  "pricing_version_id",
  "amount_paid_cents",
  "currency",
  "status",
  "booking_snapshot",
  "created_at",
  "paystack_reference",
  "cleaner_id",
  "assigned_at",
  "en_route_at",
  "started_at",
  "completed_at",
  "duration_minutes",
  "rooms",
  "bathrooms",
  "extras",
  "cleaners(full_name,phone)",
].join(",");

function normalizeCleanerJoin(row: BookingRow): BookingRow {
  const raw = row as BookingRow & { cleaners?: unknown };
  const c = raw.cleaners;
  if (Array.isArray(c)) {
    return { ...row, cleaners: (c[0] as BookingRow["cleaners"]) ?? null };
  }
  return row;
}

export function useBookings(): {
  bookings: DashboardBooking[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  cancelBooking: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  rescheduleBooking: (id: string, date: string, time: string) => Promise<{ ok: true } | { ok: false; message: string }>;
} {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const realtimeDebounceRef = useRef<number | null>(null);

  const fetchBookings = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setRows([]);
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    let res = await sb
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("user_id", userId)
      .neq("status", "pending_payment")
      .neq("status", "payment_expired")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (res.error && /cleaners|relationship|schema/i.test(res.error.message)) {
      res = await sb
        .from("bookings")
        .select(BOOKING_SELECT.replace(",cleaners(full_name,phone)", ""))
        .eq("user_id", userId)
        .neq("status", "pending_payment")
        .neq("status", "payment_expired")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
    }

    if (res.error) {
      setError(res.error.message);
      setRows([]);
    } else {
      setRows(((res.data ?? []) as unknown as BookingRow[]).map(normalizeCleanerJoin));
    }
    if (!silent) setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userLoading) return;
    const tid = window.setTimeout(() => void fetchBookings(), 0);
    return () => window.clearTimeout(tid);
  }, [userLoading, fetchBookings]);

  useEffect(() => {
    if (userLoading || !userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const schedule = () => {
      if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = window.setTimeout(() => {
        realtimeDebounceRef.current = null;
        void fetchBookings({ silent: true });
      }, 400);
    };

    const channel = sb
      .channel(`customer-dashboard-bookings-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${userId}` },
        schedule,
      )
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
      void sb.removeChannel(channel);
    };
  }, [userLoading, userId, fetchBookings]);

  const bookings = useMemo(() => rows.map((r) => mapBookingRow(r)), [rows]);

  const cancelBooking = useCallback(async (id: string) => {
    const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>(`/api/dashboard/bookings/${id}/cancel`, {
      method: "POST",
    });
    if (!out.ok) {
      return { ok: false as const, message: out.error };
    }
    await fetchBookings();
    return { ok: true as const };
  }, [fetchBookings]);

  const refetchBookings = useCallback(() => fetchBookings(), [fetchBookings]);

  const rescheduleBooking = useCallback(
    async (id: string, date: string, time: string) => {
      const timeNorm = time.trim().length >= 5 ? time.trim().slice(0, 5) : time.trim();
      const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>(`/api/dashboard/bookings/${id}/reschedule`, {
        method: "PATCH",
        json: { date: date.trim(), time: timeNorm },
      });
      if (!out.ok) {
        return { ok: false as const, message: out.error };
      }
      await fetchBookings();
      return { ok: true as const };
    },
    [fetchBookings],
  );

  return {
    bookings,
    loading: userLoading || loading,
    error,
    refetch: refetchBookings,
    cancelBooking,
    rescheduleBooking,
  };
}

export function useBookingDetail(id: string | undefined): {
  booking: DashboardBooking | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  cancelBooking: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  rescheduleBooking: (id: string, date: string, time: string) => Promise<{ ok: true } | { ok: false; message: string }>;
} {
  const { user, loading: userLoading } = useUser();
  const detailUserId = user?.id;
  const [row, setRow] = useState<BookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const detailDebounceRef = useRef<number | null>(null);

  const fetchOne = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!detailUserId || !id) {
      setRow(null);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setRow(null);
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    let res = await sb
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", id)
      .eq("user_id", detailUserId)
      .maybeSingle();

    if (res.error && /cleaners|relationship|schema/i.test(res.error.message)) {
      res = await sb
        .from("bookings")
        .select(BOOKING_SELECT.replace(",cleaners(full_name,phone)", ""))
        .eq("id", id)
        .eq("user_id", detailUserId)
        .maybeSingle();
    }

    if (res.error) {
      setError(res.error.message);
      setRow(null);
    } else if (!res.data) {
      setRow(null);
      setError(null);
    } else {
      setRow(normalizeCleanerJoin(res.data as unknown as BookingRow));
    }
    if (!silent) setLoading(false);
  }, [detailUserId, id]);

  useEffect(() => {
    if (userLoading) return;
    const tid = window.setTimeout(() => void fetchOne(), 0);
    return () => window.clearTimeout(tid);
  }, [userLoading, fetchOne]);

  useEffect(() => {
    if (userLoading || !detailUserId || !id) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const schedule = () => {
      if (detailDebounceRef.current) window.clearTimeout(detailDebounceRef.current);
      detailDebounceRef.current = window.setTimeout(() => {
        detailDebounceRef.current = null;
        void fetchOne({ silent: true });
      }, 400);
    };

    const channel = sb
      .channel(`customer-booking-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `id=eq.${id}` }, schedule)
      .subscribe();

    return () => {
      if (detailDebounceRef.current) window.clearTimeout(detailDebounceRef.current);
      void sb.removeChannel(channel);
    };
  }, [userLoading, detailUserId, id, fetchOne]);

  const cancelBooking = useCallback(
    async (bid: string) => {
      const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>(`/api/dashboard/bookings/${bid}/cancel`, {
        method: "POST",
      });
      if (!out.ok) {
        return { ok: false as const, message: out.error };
      }
      await fetchOne();
      return { ok: true as const };
    },
    [fetchOne],
  );

  const rescheduleBooking = useCallback(
    async (bid: string, date: string, time: string) => {
      const timeNorm = time.trim().length >= 5 ? time.trim().slice(0, 5) : time.trim();
      const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>(`/api/dashboard/bookings/${bid}/reschedule`, {
        method: "PATCH",
        json: { date: date.trim(), time: timeNorm },
      });
      if (!out.ok) {
        return { ok: false as const, message: out.error };
      }
      await fetchOne();
      return { ok: true as const };
    },
    [fetchOne],
  );

  const booking = row ? mapBookingRow(row) : null;

  const refetchOne = useCallback(() => fetchOne(), [fetchOne]);

  return {
    booking,
    loading: userLoading || loading,
    error,
    refetch: refetchOne,
    cancelBooking,
    rescheduleBooking,
  };
}
