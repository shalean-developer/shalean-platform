"use client";

import { Check, Star } from "lucide-react";
import type { LiveCleaner } from "@/components/booking/useCleaners";

type CleanerCardProps = {
  cleaner: LiveCleaner;
  selected: boolean;
  onSelect: () => void;
  variant: "featured" | "compact";
  /** Featured-only: trust badges under bio */
  showTrustBadges?: boolean;
  /** Featured-only: microcopy under title */
  recommendHint?: string;
  /** Tighter mobile layout (standalone cleaner step). */
  compactMobile?: boolean;
};

export function CleanerCard({
  cleaner,
  selected,
  onSelect,
  variant,
  showTrustBadges = false,
  recommendHint,
  compactMobile = false,
}: CleanerCardProps) {
  const isFeatured = variant === "featured";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "relative w-full rounded-2xl border text-left transition-all duration-200 ease-out",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "active:scale-[0.99] motion-reduce:active:scale-100",
        selected
          ? "z-[1] scale-[1.02] border-primary bg-primary/5 shadow-lg ring-1 ring-primary/20 motion-reduce:scale-100"
          : "border-zinc-200/90 bg-white hover:border-primary/50 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500",
        isFeatured
          ? compactMobile
            ? "p-4 max-lg:rounded-xl max-lg:p-3 sm:p-6"
            : "p-5 sm:p-6"
          : compactMobile
            ? "p-4 max-lg:rounded-xl max-lg:p-2.5 max-lg:py-3"
            : "p-4",
      ].join(" ")}
    >
      {selected ? (
        <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-sm">
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </span>
      ) : null}

      <div
        className={
          isFeatured
            ? compactMobile
              ? "flex flex-col gap-3 max-lg:gap-2 sm:flex-row sm:items-start"
              : "flex flex-col gap-4 sm:flex-row sm:items-start"
            : compactMobile
              ? "flex gap-2.5 max-lg:items-center"
              : "flex gap-3"
        }
      >
        <div
          className={[
            "relative shrink-0 overflow-hidden rounded-full bg-zinc-100 ring-2 ring-white dark:bg-zinc-800 dark:ring-zinc-900",
            isFeatured
              ? compactMobile
                ? "h-20 w-20 max-lg:h-12 max-lg:w-12 sm:h-24 sm:w-24"
                : "h-20 w-20 sm:h-24 sm:w-24"
              : compactMobile
                ? "h-14 w-14 max-lg:h-11 max-lg:w-11"
                : "h-14 w-14",
          ].join(" ")}
        >
          {/* External avatar URLs — avoid next/image remotePatterns churn */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.pravatar.cc/128?u=${cleaner.id}`}
            alt={cleaner.full_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>

        <div className="min-w-0 flex-1">
            {isFeatured && recommendHint ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <Star className="h-3.5 w-3.5 fill-primary/20" strokeWidth={2} aria-hidden />
              Recommended for you
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3
              className={[
                "font-semibold text-zinc-900 dark:text-zinc-50",
                isFeatured ? "text-lg" : "text-base",
              ].join(" ")}
            >
              {cleaner.full_name}
            </h3>
            {cleaner.rating >= 4.8 ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Top rated
              </span>
            ) : cleaner.jobs_completed > 300 ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Experienced
              </span>
            ) : null}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="inline-flex items-center gap-0.5 font-medium text-zinc-800 dark:text-zinc-200">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden />
              {cleaner.rating.toFixed(1)}
            </span>
            <span className="text-zinc-400">·</span>
            <span>{cleaner.jobs_completed.toLocaleString("en-ZA")} jobs</span>
            {cleaner.review_count > 0 ? (
              <>
                <span className="text-zinc-400">·</span>
                <span>
                  {cleaner.review_count.toLocaleString("en-ZA")}{" "}
                  {cleaner.review_count === 1 ? "review" : "reviews"}
                </span>
              </>
            ) : null}
          </p>

          <p
            className={[
              "mt-2 text-sm text-zinc-600 max-lg:inline max-lg:text-xs max-lg:leading-snug dark:text-zinc-400",
              compactMobile ? "max-lg:mt-1" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
              {cleaner.jobs_completed.toLocaleString("en-ZA")}
            </span>{" "}
            jobs ·{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {typeof cleaner.distance_km === "number"
                ? `${cleaner.distance_km.toFixed(1)} km away`
                : "Distance unavailable"}
            </span>{" "}
            · {cleaner.is_available ? "Available now" : "Unavailable"}
          </p>

          {isFeatured && recommendHint ? (
            <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{recommendHint}</p>
          ) : null}

          {showTrustBadges && isFeatured ? (
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden />
                Verified
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden />
                Background checked
              </li>
            </ul>
          ) : null}

          {cleaner.recent_reviews && cleaner.recent_reviews.length > 0 ? (
            <ul
              className={[
                "space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800",
                isFeatured ? "mt-4" : "mt-3",
                compactMobile ? "max-lg:hidden" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {cleaner.recent_reviews.slice(0, 3).map((r, i) => (
                <li key={`${r.rating}-${i}`} className="text-xs leading-snug text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-amber-600 dark:text-amber-500">{r.rating}★</span>{" "}
                  <span className="line-clamp-2">{r.quote}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </button>
  );
}
