"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

function scopedAdminReadEndpoint(endpoint: string): string {
  return endpoint === "/api/admin/bookings" ? "/api/admin/bookings/scoped" : endpoint;
}

function johannesburgCurrentMonthRange(): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  if (!year || !month) return { from: "", to: "" };
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * The Office bookings page historically initialized its date inputs to the
 * current Johannesburg month while also marking the semantic filter as
 * "All dates". Until the page state is fully separated, remove only that exact
 * implicit current-month pair. User-selected custom ranges remain intact.
 */
function normalizedAdminReadParams(
  endpoint: string,
  params?: Record<string, string>,
): Record<string, string> | undefined {
  if (!params || endpoint !== "/api/admin/bookings" || params.filter !== "all") return params;

  const currentMonth = johannesburgCurrentMonthRange();
  if (params.from !== currentMonth.from || params.to !== currentMonth.to) return params;

  const next = { ...params };
  delete next.from;
  delete next.to;
  return next;
}

/**
 * Shared hook for authenticated admin API fetches.
 * Automatically attaches Bearer token from the active Supabase session.
 */
export function useAdminData<T>(
  endpoint: string,
  options?: { enabled?: boolean; params?: Record<string, string> },
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const normalizedParams = normalizedAdminReadParams(endpoint, options?.params);
  const paramsKey = normalizedParams
    ? new URLSearchParams(Object.entries(normalizedParams).sort(([a], [b]) => a.localeCompare(b))).toString()
    : "";
  const enabled = options?.enabled !== false;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let token: string | undefined;
      try {
        token = (await getSupabaseAccessToken()) ?? undefined;
      } catch {
        setError("Could not read admin session. Check your connection and try again.");
        setLoading(false);
        return;
      }
      if (!token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const resolvedEndpoint = scopedAdminReadEndpoint(endpoint);
      let url = resolvedEndpoint;
      if (paramsKey) {
        url = `${resolvedEndpoint}?${paramsKey}`;
      }

      const res = await globalThis.fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Error ${res.status}`);
        setLoading(false);
        return;
      }

      const json = (await res.json()) as T;
      setData(json);
    } catch (e) {
      setError(
        e instanceof TypeError && e.message === "Failed to fetch"
          ? "Network error — check the dev server is running."
          : e instanceof Error
            ? e.message
            : "Failed to fetch",
      );
    } finally {
      setLoading(false);
    }
  }, [endpoint, paramsKey]);

  useEffect(() => {
    if (!enabled) return;
    const timer = globalThis.setTimeout(() => {
      void loadData();
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [loadData, enabled]);

  return { data, loading, error, refetch: loadData };
}

/**
 * Helper to get admin bearer token. Use in event handlers (assign, cancel, etc.)
 */
export async function getAdminToken(): Promise<string | null> {
  try {
    return await getSupabaseAccessToken();
  } catch {
    return null;
  }
}

/**
 * Typed admin fetch for one-off mutations (PATCH, POST, DELETE).
 */
export async function adminFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const token = await getAdminToken();
    if (!token) return { ok: false, error: "Not authenticated" };

    const res = await globalThis.fetch(endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: (json as { error?: string }).error ?? `Error ${res.status}`,
        data: json,
      };
    }
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}
