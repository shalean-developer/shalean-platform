"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    if (!user?.id) {
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
    setLoading(true);
    setError(null);

    let res = await sb
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("user_id", user.id)
      .neq("status", "pending_payment")
      .neq("status", "payment_expired")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (res.error && /cleaners|relationship|schema/i.test(res.error.message)) {
      res = await sb
        .from("bookings")
        .select(BOOKING_SELECT.replace(",cleaners(full_name,phone)", ""))
        .eq("user_id", user.id)
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
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (userLoading) return;
    void fetchBookings();
  }, [userLoading, fetchBookings]);

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
    refetch: fetchBookings,
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
  const [row, setRow] = useState<BookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOne = useCallback(async () => {
    if (!user?.id || !id) {
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
    setLoading(true);
    setError(null);

    let res = await sb
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (res.error && /cleaners|relationship|schema/i.test(res.error.message)) {
      res = await sb
        .from("bookings")
        .select(BOOKING_SELECT.replace(",cleaners(full_name,phone)", ""))
        .eq("id", id)
        .eq("user_id", user.id)
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
    setLoading(false);
  }, [user?.id, id]);

  useEffect(() => {
    if (userLoading) return;
    void fetchOne();
  }, [userLoading, fetchOne]);

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

  return {
    booking,
    loading: userLoading || loading,
    error,
    refetch: fetchOne,
    cancelBooking,
    rescheduleBooking,
  };
}
