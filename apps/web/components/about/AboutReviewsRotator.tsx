"use client";

import { useEffect, useState } from "react";
import type { AboutReview } from "@/lib/about/about-page-content";
import { ReviewCard } from "@/components/about/ReviewCard";
import { cn } from "@/lib/utils";

type Props = {
  reviews: readonly AboutReview[];
  intervalMs?: number;
};

/**
 * Single spotlight review on mobile / narrow layouts; full grid still SSR’d separately if needed.
 * Rotates quotes for returning visitors without hiding content from crawlers (initial review is static in page shell).
 */
export function AboutReviewsRotator({ reviews, intervalMs = 7000 }: Props) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reviews.length <= 1) return;
    const t = window.setInterval(() => {
      setI((v) => (v + 1) % reviews.length);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [reviews.length, intervalMs]);

  const active = reviews[i] ?? reviews[0];
  if (!active) return null;

  return (
    <div>
      <div className="transition-opacity duration-300">
        <ReviewCard quote={active.quote} author={active.author} initials={active.initials} suburb={active.suburb} />
      </div>
      {reviews.length > 1 ? (
        <div className="mt-4 flex justify-center gap-2" role="tablist" aria-label="Customer reviews">
          {reviews.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx === i}
              aria-label={`Show review ${idx + 1}`}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full transition",
                idx === i ? "bg-emerald-600" : "bg-transparent",
              )}
              onClick={() => setI(idx)}
            >
              <span
                className={cn(
                  "size-2.5 rounded-full transition",
                  idx === i ? "bg-white" : "bg-zinc-300 hover:bg-zinc-400",
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
