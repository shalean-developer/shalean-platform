"use client";

import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SeoHubGrowthCtaLink } from "@/components/seo/SeoHubGrowthCtaLink";
import { trackSeoLocationScroll, type SeoLocationAnalyticsBase } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

type Props = {
  /** Scroll-to-top target — matches `[data-location-hub-root]` on the hub `<main>`. */
  hubSelector?: string;
  trackingSlug: string;
  stickyLine: string;
  analyticsCtx: SeoLocationAnalyticsBase & { hub_tier?: string; seo_priority?: number | string };
};

const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

/**
 * Scroll progress + sticky booking strip for long location hubs (dwell time / conversion).
 * Fires `seo_location_scroll` once per milestone per session (deduped client-side).
 */
export function LocationHubEngagementClient({
  hubSelector = "[data-location-hub-root]",
  trackingSlug,
  stickyLine,
  analyticsCtx,
}: Props) {
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const milestonesFired = useRef<Set<number>>(new Set());

  const onScroll = useCallback(() => {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const p = scrollable > 0 ? Math.min(100, (doc.scrollTop / scrollable) * 100) : 0;
    setProgress(p);
    setShowTop(doc.scrollTop > 420);

    for (const m of SCROLL_MILESTONES) {
      if (p >= m && !milestonesFired.current.has(m)) {
        milestonesFired.current.add(m);
        trackSeoLocationScroll(m, {
          ...analyticsCtx,
          hub_tier: analyticsCtx.hub_tier,
          seo_priority: analyticsCtx.seo_priority,
        });
      }
    }
  }, [analyticsCtx]);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const scrollTop = () => {
    const root = document.querySelector(hubSelector);
    if (root instanceof HTMLElement) {
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 bg-emerald-100/90" aria-hidden>
        <div
          className="h-full bg-emerald-600 transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <button
        type="button"
        onClick={scrollTop}
        className={cn(
          "fixed bottom-28 right-4 z-[45] flex size-12 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-800 shadow-lg transition hover:border-emerald-400 hover:bg-emerald-50 lg:bottom-32",
          showTop ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2",
        )}
        aria-label="Back to top"
      >
        <ArrowUp className="size-5" />
      </button>

      <div
        data-location-hub-sticky-cta
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-4 print:hidden"
      >
        <div className="pointer-events-auto mx-4 flex max-w-xl flex-col gap-2 rounded-2xl border border-emerald-200/90 bg-white/95 px-4 py-3 shadow-lg shadow-emerald-900/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
          <p className="text-center text-sm font-medium leading-snug text-zinc-800 sm:text-left">{stickyLine}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            <SeoHubGrowthCtaLink
              href="/book"
              source={`seo_loc_${trackingSlug}_sticky_cta`}
              ctx={analyticsCtx}
              ctaLocation="sticky_bar"
              ctaLabel="See price & book"
              ctaKind="see_price_book"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              See price &amp; book
            </SeoHubGrowthCtaLink>
            <Link
              href="/locations"
              className="text-xs font-semibold text-emerald-800 underline-offset-4 hover:underline"
            >
              Cape Town overview
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
