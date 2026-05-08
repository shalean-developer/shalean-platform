"use client";

import { useEffect, useMemo, useState } from "react";

type TrustStats = {
  bookingsToday: number;
  bookingsThisWeek: number;
  completedThisWeek: number;
  avgRating: number;
  reviewCount: number;
};

type BookingTrustSignalsProps = {
  variant?: "compact" | "proof";
};

const RESULT_PHOTOS = [
  {
    label: "Before",
    caption: "Focus areas scoped before arrival",
    src: "/images/blog/cape-town-kitchen-deep-clean.jpg",
  },
  {
    label: "After",
    caption: "Kitchen and surfaces reset",
    src: "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
  },
] as const;

function statLabel(count: number, fallback: string, singular: string, plural: string): string {
  if (!Number.isFinite(count) || count <= 0) return fallback;
  return `${count.toLocaleString("en-ZA")} ${count === 1 ? singular : plural}`;
}

export function BookingTrustSignals({ variant = "compact" }: BookingTrustSignalsProps) {
  const [stats, setStats] = useState<TrustStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/booking/trust-stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: TrustStats | null) => {
        if (!cancelled) setStats(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const chips = useMemo(
    () => [
      statLabel(stats?.completedThisWeek ?? 0, "Active weekly bookings", "booking completed this week", "bookings completed this week"),
      statLabel(stats?.bookingsToday ?? 0, "Bookings today", "booked time today", "booked times today"),
      stats?.avgRating
        ? `${stats.avgRating.toFixed(1)} star average from ${stats.reviewCount.toLocaleString("en-ZA")} reviews`
        : "Verified customer reviews",
      "Verified cleaners",
    ],
    [stats],
  );

  if (variant === "compact") {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
          Buyer confidence
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-zinc-950 dark:text-emerald-100"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Trusted by Cape Town homes
          </p>
          <h2 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Real demand, verified cleaners, visible results.
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.slice(0, 3).map((chip) => (
            <span
              key={chip}
              className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {RESULT_PHOTOS.map((photo) => (
          <figure key={photo.label} className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            {/* Local marketing proof images; Next/Image not needed for this small trust strip. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt={`${photo.label}: ${photo.caption}`} className="h-32 w-full object-cover" loading="lazy" />
            <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{photo.label}</span>
              <span className="text-right text-zinc-500 dark:text-zinc-400">{photo.caption}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
