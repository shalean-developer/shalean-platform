"use client";

import { Bell, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PendingOffersDashboardHeroProps = {
  pendingOffersCount: number;
  /** When true, render at hero-block density (smaller padding, no outer gradient). */
  embedded?: boolean;
  /**
   * When true, render with `position: sticky; top: 0` so the hero stays
   * pinned to the top of the viewport while the rest of the dashboard
   * scrolls beneath it. Used by the dispatch-console layout on Home so
   * a pending offer is impossible to scroll past.
   */
  sticky?: boolean;
};

/**
 * Compact alert surface shown on `/cleaner/dashboard` whenever the cleaner
 * has at least one pending dispatch offer. Anchors to the
 * `JobOffersSection` heading so a tap scrolls straight to Accept/Decline.
 *
 * Premium / dispatch-app shape:
 *   ┌───────────────────────────────────────────────────┐
 *   │ [🔔] 1 new job offer waiting                  [→] │
 *   │      Review before it expires                     │
 *   └───────────────────────────────────────────────────┘
 *
 * Why it exists:
 * - The dashboard pushes `JobOffersSection` below the fold on small phones;
 *   with SMS auth occasionally failing, a cleaner who landed on Home from
 *   any other entry point could miss a pending offer entirely.
 * - This hero is impossible to scroll past, talks like an alert, and links
 *   directly to the offer cards rendered immediately below it.
 * - In the dispatch-console layout it is rendered with `sticky` so it pins
 *   to the top of the viewport during scroll.
 */
export function PendingOffersDashboardHero({ pendingOffersCount, embedded, sticky }: PendingOffersDashboardHeroProps) {
  if (pendingOffersCount <= 0) return null;
  const plural = pendingOffersCount > 1;
  const headline = plural ? `${pendingOffersCount} new job offers waiting` : "1 new job offer waiting";
  const helper = plural ? "Review before they expire" : "Review before it expires";

  const link = (
    <a
      href="#cleaner-offers-heading"
      data-testid="pending-offers-hero"
      aria-label={`${headline} — tap to review and accept or decline.`}
      className={cn(
        "group flex items-center gap-3 bg-emerald-500/10 text-foreground transition-colors hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20",
        embedded ? "rounded-xl px-3 py-2.5" : "rounded-2xl px-3.5 py-3",
      )}
    >
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
        <Bell className="size-4" aria-hidden />
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-xl ring-2 ring-emerald-400/50 motion-safe:animate-ping"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight text-emerald-950 dark:text-emerald-50">
          {headline}
        </p>
        <p className="mt-0.5 truncate text-xs text-emerald-900/80 dark:text-emerald-100/85">{helper}</p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-emerald-700/70 transition-transform group-hover:translate-x-0.5 dark:text-emerald-200/80"
        aria-hidden
      />
    </a>
  );

  if (!sticky) return link;

  // Sticky wrapper bleeds to the page edges (mx-4 column → -mx-4) and adds
  // a subtle drop shadow once the user scrolls past it so it never blends
  // into the section that follows.
  return (
    <div className="sticky top-0 z-30 -mx-4 bg-background/95 px-4 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto max-w-lg">{link}</div>
    </div>
  );
}
