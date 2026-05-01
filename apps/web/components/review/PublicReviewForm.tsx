"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  initialBookingId: string;
};

function StarsInput({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rounded-lg p-1 transition hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
          aria-label={`${n} stars`}
        >
          <Star className={n <= value ? "h-9 w-9 fill-amber-400 text-amber-500" : "h-9 w-9 text-zinc-300 dark:text-zinc-600"} />
        </button>
      ))}
    </div>
  );
}

export function PublicReviewForm({ initialBookingId }: Props) {
  const base = getPublicAppUrlBase();
  const bookingId = initialBookingId.trim();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const refreshSession = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) {
      setSignedIn(false);
      return;
    }
    const { data } = await sb.auth.getSession();
    setSignedIn(Boolean(data.session?.access_token));
  }, []);

  useEffect(() => {
    void refreshSession();
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      void refreshSession();
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshSession]);

  useEffect(() => {
    const bid = bookingId.trim();
    if (!bid) return;
    const k = `shalean_review_prompt_click_${bid}`;
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(k)) return;
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(k, "1");
    } catch {
      /* ignore */
    }
    trackGrowthEvent("review_prompt_clicked", { booking_id: bid });
  }, [bookingId]);

  const loginHref = `/login?redirect=${encodeURIComponent(bookingId ? `/review?booking=${bookingId}` : "/review")}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bookingId) {
      setError("This link is missing a booking reference. Open the review link from your email or use Leave review on your booking.");
      return;
    }
    if (rating < 1 || rating > 5) {
      setError("Please choose a star rating from 1 to 5.");
      return;
    }
    const token = await getDashboardAccessToken();
    if (!token) {
      setError("Please sign in to submit your review.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/bookings/review", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, rating, comment }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not save your review.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (!bookingId) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Leave a review</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t find a booking in this link. Open the review link from your completion email, or leave a review from your dashboard.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="rounded-xl">
            <Link href={`${base}/dashboard/reviews`}>Reviews in dashboard</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`${base}/dashboard/bookings`}>Your bookings</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (signedIn === null) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Sign in to review</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Log in with the same account you used to book, then you can rate this clean and add an optional comment.
        </p>
        <div className="mt-8">
          <Button asChild size="lg" className="rounded-xl">
            <Link href={loginHref}>Sign in to continue</Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-zinc-500">
          Booking reference <span className="font-mono text-zinc-600">{bookingId.slice(0, 8)}…</span>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Thank you</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Your review was saved. It helps us improve and recognize great cleaners.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="rounded-xl">
            <Link href={`${base}/dashboard/bookings`}>Your bookings</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`${base}/booking/details`}>Book again</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">How was your clean?</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Rate your experience for booking {bookingId.slice(0, 8)}…</p>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label className="text-zinc-800 dark:text-zinc-200">Overall rating</Label>
          <StarsInput value={rating} onChange={setRating} disabled={busy} />
          <p className="text-xs text-zinc-500">Required — tap the stars.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rev-comment" className="text-zinc-800 dark:text-zinc-200">
            Comment <span className="font-normal text-zinc-500">(optional)</span>
          </Label>
          <Textarea
            id="rev-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went well, or what could be better?"
            rows={4}
            disabled={busy}
            className="rounded-xl"
            maxLength={2000}
          />
        </div>

        <Button type="submit" size="lg" className="w-full rounded-xl sm:w-auto" disabled={busy}>
          {busy ? "Submitting…" : "Submit review"}
        </Button>
      </form>
    </div>
  );
}
