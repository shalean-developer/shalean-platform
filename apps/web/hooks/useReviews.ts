"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ReviewRow } from "@/lib/dashboard/types";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

export type ReviewListItem = ReviewRow & {
  serviceName: string;
  bookingDate: string | null;
  /**
   * M-15: lead-cleaner / solo-cleaner display name from the
   * `reviews → cleaners(full_name)` join. For team jobs this is the lead
   * cleaner the H-8 review-submission resolver wrote into
   * `reviews.cleaner_id`, so the displayed name stays in lockstep with
   * the cleaner the rating was actually saved against. `null` when the
   * cleaner row is missing or the join silently dropped.
   */
  cleanerName: string | null;
};

/**
 * PostgREST returns a single object for many-to-one (FK) embeds, but the
 * Supabase JS generated types default to arrays. Accept both shapes here so
 * the cast through `unknown` below stays sound regardless of which shape
 * the runtime sees.
 */
type CleanerEmbedSingle = { full_name: string | null } | null;
type BookingEmbedSingle = { service: string | null; date: string | null } | null;
type ReviewRowWithJoins = ReviewRow & {
  cleaners?: CleanerEmbedSingle | CleanerEmbedSingle[];
  bookings?: BookingEmbedSingle | BookingEmbedSingle[];
};

function pickFirstEmbed<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null;
  return (v ?? null) as T | null;
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
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setReviews([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // M-15: pull cleaner name + booking service/date alongside the review
    // row so each card can display "Reviewed <Cleaner Name> · <Service>".
    // `cleaners(full_name)` joins via `reviews.cleaner_id` — for team jobs
    // (H-8) this is the lead cleaner UUID the submission resolver wrote
    // (see `resolveReviewCleanerIdForSubmission`), so the displayed name
    // exactly matches the cleaner the rating was saved against. The
    // `bookings` embed is read-only and adds no roster fields beyond what
    // the customer dashboard already exposes.
    const res = await sb
      .from("reviews")
      .select(
        "id, booking_id, user_id, cleaner_id, rating, comment, created_at, cleaners(full_name), bookings(service, date)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (res.error) {
      setError(res.error.message);
      setReviews([]);
    } else {
      const rows = (res.data as unknown as ReviewRowWithJoins[]) ?? [];
      setReviews(
        rows.map((r) => {
          const cleaner = pickFirstEmbed(r.cleaners);
          const booking = pickFirstEmbed(r.bookings);
          const cleanerName = cleaner?.full_name?.trim() || null;
          const svc = booking?.service?.trim() || "";
          const bdate = booking?.date?.trim() || null;
          return {
            ...r,
            // Drop the join shape from the persisted item — UI binds to the
            // flattened `cleanerName` / `serviceName` / `bookingDate` fields.
            cleaners: undefined,
            bookings: undefined,
            serviceName: svc || `Booking ${r.booking_id.slice(0, 8)}…`,
            bookingDate: bdate,
            cleanerName,
          } as ReviewListItem;
        }),
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
