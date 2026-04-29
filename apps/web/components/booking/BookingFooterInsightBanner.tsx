"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const storageKey = (variant: "quote" | "details") => `shalean-footer-insight-dismissed-${variant}`;

export type BookingFooterInsightBannerProps = {
  variant: "quote" | "details";
  onDismiss: () => void;
};

export function BookingFooterInsightBanner({ variant, onDismiss }: BookingFooterInsightBannerProps) {
  const [entered, setEntered] = useState(false);
  const copy = bookingCopy.footerInsight;

  useEffect(() => {
    const t = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(t);
  }, []);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey(variant), "1");
    } catch {
      /* ignore */
    }
    onDismiss();
  }, [onDismiss, variant]);

  return (
    <div
      className={cn(
        "border-b border-blue-700/30 bg-blue-600 text-white shadow-[0_-8px_28px_rgba(37,99,235,0.35)] lg:hidden dark:bg-blue-600 dark:shadow-blue-950/40",
        "transition-[opacity,transform] duration-300 ease-out",
        entered ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
      )}
      role="region"
      aria-labelledby="footer-insight-headline"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        {/* Icon badge — white disc + brand accent icon (Shalean) */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-md shadow-blue-900/15 ring-2 ring-white/80 sm:h-11 sm:w-11"
          aria-hidden
        >
          <Sparkles className="h-5 w-5 text-blue-600 sm:h-[1.35rem] sm:w-[1.35rem]" strokeWidth={2} />
        </div>

        <div className="min-w-0 flex-1">
          <p id="footer-insight-headline" className="text-[13px] font-semibold leading-tight tracking-tight text-white sm:text-sm">
            <span>{copy.bannerHeadlineLead}</span>{" "}
            <span className="font-extrabold uppercase tracking-wide text-white">{copy.bannerHeadlineEmphasis}</span>{" "}
            <span className="font-medium text-white/95">{copy.bannerHeadlineTail}</span>
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/85 sm:text-xs">
            {copy.finalPriceNote} {copy.flexibleTime}
          </p>
        </div>

        {/* Pill CTA — high contrast like Sweep “Learn More” */}
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full bg-zinc-900 px-3.5 py-2 text-xs font-bold tracking-wide text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] sm:px-5 sm:text-sm"
        >
          {copy.bannerCta}
        </button>

        {/* Circular dismiss */}
        <button
          type="button"
          onClick={dismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/25 text-white transition hover:bg-black/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 sm:h-9 sm:w-9"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function readFooterInsightDismissed(variant: "quote" | "details"): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(storageKey(variant)) === "1";
}
