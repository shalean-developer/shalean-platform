"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { UserNotificationRow } from "@/lib/dashboard/types";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

export function useNotifications(): {
  notifications: UserNotificationRow[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  markRead: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  markAllRead: () => Promise<{ ok: true } | { ok: false; message: string }>;
} {
  const { user, loading: userLoading } = useUser();
  const [notifications, setNotifications] = useState<UserNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sb
      .from("user_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (res.error) {
      setError(res.error.message);
      setNotifications([]);
    } else {
      setNotifications((res.data as UserNotificationRow[]) ?? []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (userLoading) return;
    void fetchNotifications();
  }, [userLoading, fetchNotifications]);

  const markRead = useCallback(
    async (id: string) => {
      const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>("/api/dashboard/notifications/mark-read", {
        method: "POST",
        json: { id },
      });
      if (!out.ok) return { ok: false as const, message: out.error };
      await fetchNotifications();
      return { ok: true as const };
    },
    [fetchNotifications],
  );

  const markAllRead = useCallback(async () => {
    const out = await dashboardFetchJson<{ ok?: boolean; error?: string }>("/api/dashboard/notifications/mark-read", {
      method: "POST",
      json: { all: true },
    });
    if (!out.ok) return { ok: false as const, message: out.error };
    await fetchNotifications();
    return { ok: true as const };
  }, [fetchNotifications]);

  return {
    notifications,
    loading: userLoading || loading,
    error,
    refetch: fetchNotifications,
    markRead,
    markAllRead,
  };
}
