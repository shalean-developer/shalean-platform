"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReviewRow } from "@/lib/dashboard/types";
import { dashboardFetchJson, getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

export type ReviewListItem = ReviewRow & {
  serviceName: string;
  bookingDate: string | null;
  cleanerName: string | null;
};

const REVIEW_ELIGIBILITY_BATCH_SIZE = 100;

export function useReviewedBookingIds(eligibleBookingIds: string[] | null): {
  reviewedIds: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
} {
  const normalizedIds = useMemo(
    () => eligibleBookingIds == null ? null : Array.from(new Set(eligibleBookingIds)).sort(),
    [eligibleBookingIds],
  );
  const requestKey = normalizedIds?.join(",") ?? null;
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (normalizedIds == null || requestKey == null) return;
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const found = new Set<string>();
        for (let offset = 0; offset < normalizedIds.length; offset += REVIEW_ELIGIBILITY_BATCH_SIZE) {
          const bookingIds = normalizedIds.slice(offset, offset + REVIEW_ELIGIBILITY_BATCH_SIZE);
          const out = await dashboardFetchJson<{ reviewedBookingIds?: string[] }>("/api/me/reviews", {
            method: "POST",
            json: { bookingIds },
          });
          if (!out.ok) throw new Error(out.error);
          for (const id of out.data.reviewedBookingIds ?? []) found.add(id);
        }
        if (!cancelled) {
          setReviewedIds(Array.from(found));
          setCompletedKey(requestKey);
        }
      } catch (lookupError) {
        if (!cancelled) {
          setReviewedIds([]);
          setCompletedKey(null);
          setError(lookupError instanceof Error ? lookupError.message : "Could not verify reviewed bookings.");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [normalizedIds, requestKey]);

  return {
    reviewedIds: useMemo(() => new Set(reviewedIds), [reviewedIds]),
    loading: requestKey == null || completedKey !== requestKey,
    error,
  };
}

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
