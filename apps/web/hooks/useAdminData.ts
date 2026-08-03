"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

function scopedAdminReadEndpoint(endpoint: string): string {
  return endpoint === "/api/admin/bookings" ? "/api/admin/bookings/scoped" : endpoint;
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
  const paramsKey = options?.params
    ? new URLSearchParams(Object.entries(options.params).sort(([a], [b]) => a.localeCompare(b))).toString()
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
