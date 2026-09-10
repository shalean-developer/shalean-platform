"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import type { BookingRow, DashboardBooking } from "@/lib/dashboard/types";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

type CustomerBookingsPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
};

type CustomerBookingsPageResponse = {
  bookings?: BookingRow[];
  pageInfo?: CustomerBookingsPageInfo;
};

const CUSTOMER_BOOKINGS_PAGE_LIMIT = 25;

type BookingFetchResult =
  | { ok: true; rows: BookingRow[]; pageInfo: CustomerBookingsPageInfo | undefined }
  | { ok: false; error: string };

async function fetchBookingPages(options: {
  pageCount?: number;
  view?: "all" | "upcoming";
}): Promise<BookingFetchResult> {
  const rows: BookingRow[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pageInfo: CustomerBookingsPageInfo | undefined;
  let pagesLoaded = 0;

  do {
    const query = new URLSearchParams({ limit: String(CUSTOMER_BOOKINGS_PAGE_LIMIT) });
    if (options.view === "upcoming") query.set("view", "upcoming");
    if (cursor) query.set("cursor", cursor);
    const out = await dashboardFetchJson<CustomerBookingsPageResponse>(`/api/customer/bookings?${query}`);
    if (!out.ok) return { ok: false, error: out.error };

    rows.push(...(Array.isArray(out.data.bookings) ? out.data.bookings : []));
    pageInfo = out.data.pageInfo;
    pagesLoaded += 1;
    if (options.pageCount && pagesLoaded >= options.pageCount) break;
    const nextCursor = pageInfo?.hasMore === true ? pageInfo.nextCursor : null;
    if (!nextCursor) break;
    if (seenCursors.has(nextCursor)) return { ok: false, error: "Bookings pagination did not converge." };
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);

  return { ok: true, rows: mergeBookingRows([], rows), pageInfo };
}

function mergeBookingRows(existing: BookingRow[], incoming: BookingRow[]): BookingRow[] {
  const byId = new Map<string, BookingRow>();
  for (const row of existing) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);
  return Array.from(byId.values());
}

export function useBookings(options?: { mode?: "complete" | "paged"; includeUpcoming?: boolean }): {
  bookings: DashboardBooking[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  cancelBooking: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  rescheduleBooking: (id: string, date: string, time: string) => Promise<{ ok: true } | { ok: false; message: string }>;
} {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const realtimeDebounceRef = useRef<number | null>(null);
  const loadedPageCountRef = useRef(1);
  const fetchEpochRef = useRef(0);
  const loadMoreInFlightRef = useRef<Promise<void> | null>(null);
  const mode = options?.mode === "paged" ? "paged" : "complete";
  const includeUpcoming = options?.includeUpcoming === true;

  const applyPageInfo = useCallback((pageInfo: CustomerBookingsPageInfo | undefined) => {
    setNextCursor(typeof pageInfo?.nextCursor === "string" ? pageInfo.nextCursor : null);
    setHasMore(pageInfo?.hasMore === true && Boolean(pageInfo.nextCursor));
  }, []);

  const fetchBookings = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const fetchEpoch = ++fetchEpochRef.current;
    if (!userId) {
      loadedPageCountRef.current = 1;
      setRows([]);
      setNextCursor(null);
      setHasMore(false);
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    const pendingLoadMore = loadMoreInFlightRef.current;
    if (pendingLoadMore) await pendingLoadMore;
    if (fetchEpoch !== fetchEpochRef.current) {
      if (!silent) setLoading(false);
      return;
    }

    const pageCount = mode === "paged" ? loadedPageCountRef.current : undefined;
    const out = await fetchBookingPages({ pageCount });
    if (fetchEpoch !== fetchEpochRef.current) {
      if (!silent) setLoading(false);
      return;
    }
    if (!out.ok) {
      setError(out.error);
      if (!silent) {
        setRows([]);
        setNextCursor(null);
        setHasMore(false);
      }
    } else {
      let nextRows = out.rows;
      if (includeUpcoming) {
        const upcoming = await fetchBookingPages({ view: "upcoming" });
        if (fetchEpoch !== fetchEpochRef.current) {
          if (!silent) setLoading(false);
          return;
        }
        if (!upcoming.ok) {
          setError(upcoming.error);
          if (!silent) setLoading(false);
          return;
        }
        nextRows = mergeBookingRows(nextRows, upcoming.rows);
      }
      setRows(nextRows);
      applyPageInfo(mode === "paged" ? out.pageInfo : undefined);
      setError(null);
    }
    if (!silent) setLoading(false);
  }, [applyPageInfo, includeUpcoming, mode, userId]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || !nextCursor || loadingMore || loadMoreInFlightRef.current) return;

    const task = (async () => {
      fetchEpochRef.current += 1;
      setLoadingMore(true);
      setError(null);
      try {
        const query = `/api/customer/bookings?limit=25&cursor=${encodeURIComponent(nextCursor)}`;
        const out = await dashboardFetchJson<CustomerBookingsPageResponse>(query);
        if (!out.ok) {
          setError(out.error);
        } else {
          const incoming = Array.isArray(out.data.bookings) ? out.data.bookings : [];
          setRows((current) => mergeBookingRows(current, incoming));
          applyPageInfo(out.data.pageInfo);
          loadedPageCountRef.current += 1;
        }
      } catch (loadMoreError) {
        setError(loadMoreError instanceof Error ? loadMoreError.message : "Could not load older bookings.");
      } finally {
        setLoadingMore(false);
      }
    })();

    loadMoreInFlightRef.current = task;
    try {
      await task;
    } finally {
      if (loadMoreInFlightRef.current === task) loadMoreInFlightRef.current = null;
    }
  }, [applyPageInfo, hasMore, loadingMore, nextCursor, userId]);

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

    /** Realtime tracks `customer_id` (production) and `user_id` (legacy dev); email-orphan rows do not subscribe. */
    const channel = sb
      .channel(`customer-dashboard-bookings-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `customer_id=eq.${userId}` },
        schedule,
      )
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
    const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>(`/api/customer/bookings/${id}/cancel`, {
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
      const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>(`/api/customer/bookings/${id}/reschedule`, {
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
    loadingMore,
    hasMore,
    error,
    refetch: refetchBookings,
    loadMore,
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
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    const out = await dashboardFetchJson<{ booking?: BookingRow }>(`/api/customer/bookings/${encodeURIComponent(id)}`);
    if (!out.ok) {
      setError(out.error);
      setRow(null);
    } else if (!out.data.booking) {
      setRow(null);
      setError(null);
    } else {
      setRow(out.data.booking);
      setError(null);
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
      const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>(`/api/customer/bookings/${bid}/cancel`, {
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
      const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>(`/api/customer/bookings/${bid}/reschedule`, {
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
