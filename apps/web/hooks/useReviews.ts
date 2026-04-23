"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ReviewRow } from "@/lib/dashboard/types";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

export type ReviewListItem = ReviewRow & {
  serviceName: string;
  bookingDate: string | null;
};

export function useReviews(): {
  reviews: ReviewListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  submitReview: (bookingId: string, rating: number, comment: string) => Promise<{ ok: true } | { ok: false; message: string }>;
} {
  const { user, loading: userLoading } = useUser();
  const [reviews, setReviews] = useState<ReviewListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    if (!user?.id) {
      setReviews([]);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setReviews([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sb
      .from("reviews")
      .select("id, booking_id, user_id, cleaner_id, rating, comment, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (res.error) {
      setError(res.error.message);
      setReviews([]);
    } else {
      const rows = (res.data as ReviewRow[]) ?? [];
      setReviews(
        rows.map((r) => ({
          ...r,
          serviceName: `Booking ${r.booking_id.slice(0, 8)}…`,
          bookingDate: null,
        })),
      );
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (userLoading) return;
    void fetchReviews();
  }, [userLoading, fetchReviews]);

  const submitReview = useCallback(
    async (bookingId: string, rating: number, comment: string) => {
      const token = await getDashboardAccessToken();
      if (!token) return { ok: false as const, message: "Not signed in." };
      const res = await fetch("/api/bookings/review", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, rating, comment }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        return { ok: false as const, message: j.error ?? "Could not save review." };
      }
      await fetchReviews();
      return { ok: true as const };
    },
    [fetchReviews],
  );

  return {
    reviews,
    loading: userLoading || loading,
    error,
    refetch: fetchReviews,
    submitReview,
  };
}
