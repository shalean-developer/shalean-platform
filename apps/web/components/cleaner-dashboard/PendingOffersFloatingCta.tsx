"use client";

import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

type PendingOffersFloatingCtaProps = {
  pendingOffersCount: number;
};

/**
 * Persistent floating call-to-action shown on the cleaner dashboard whenever
 * a pending offer exists. Renders as a fixed pill above the bottom navigation
 * (z-40, above the nav's z-30) and respects the iOS safe-area inset.
 *
 * Why it exists in addition to the sticky `PendingOffersDashboardHero`:
 *  - The sticky hero only stays anchored while the cleaner is on Home.
 *    The floating CTA gives an unmissable "1 offer waiting" target that
 *    scrolls back to the offers section even from far down the dashboard.
 *  - On large landscape phones / tablets, the sticky band can be missed
 *    when the user thumbs through the rest of the dashboard. The floating
 *    CTA keeps the urgent action in their visual field.
 */
export function PendingOffersFloatingCta({ pendingOffersCount }: PendingOffersFloatingCtaProps) {
  if (pendingOffersCount <= 0) return null;
  const plural = pendingOffersCount > 1;
  // Sentence case + tabular count — feels more like a modern dispatch app
  // than the previous all-caps "1 OFFER WAITING".
  const label = plural ? `${pendingOffersCount} offers waiting` : "1 offer waiting";
  return (
    <a
      href="#cleaner-offers-heading"
      data-testid="pending-offers-floating-cta"
      aria-label={`${label} — tap to review and accept or decline.`}
      // The bottom nav is z-30 with `pb-[env(safe-area-inset-bottom)]`. We sit
      // above it (z-40) and add bottom-20 + safe-area so we clear the nav on
      // notched / gesture-bar phones too.
      className={cn(
        "fixed inset-x-0 z-40 mx-auto flex w-fit items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(16,185,129,0.65)] transition-transform duration-200 hover:bg-emerald-600/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 active:scale-[0.97]",
        "bottom-[calc(env(safe-area-inset-bottom)+5rem)]",
      )}
    >
      <span className="relative flex size-4 items-center justify-center">
        <Bell className="size-3.5" aria-hidden />
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-emerald-200/55 motion-safe:animate-ping"
        />
      </span>
      <span className="tracking-tight">{label}</span>
    </a>
  );
}
