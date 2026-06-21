"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewRow } from "@/lib/dashboard/types";
import { dashboardFetchJson, getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

export type ReviewListItem = ReviewRow & {
  serviceName: string;
  bookingDate: string | null;
  cleanerName: string | null;
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
    setLoading(true);
    setError(null);
    const out = await dashboardFetchJson<{ reviews?: ReviewListItem[] }>("/api/me/reviews", { method: "GET" });
    if (!out.ok) {
      setError(out.error);
      setReviews([]);
    } else {
      setReviews(Array.isArray(out.data.reviews) ? out.data.reviews : []);
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
