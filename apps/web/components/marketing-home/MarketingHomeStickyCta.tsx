"use client";

import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

/** Mobile sticky bar on the marketing homepage. */
export function MarketingHomeStickyCta() {
  const bookHref = marketingHomeBookingHref();

  return (
    <div
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-lg rounded-lg border border-[#DCE7FF] bg-white/95 p-2 shadow-[0_12px_36px_rgba(0,22,78,0.2)] backdrop-blur-md md:hidden print:hidden [:root[data-promo-announcement]_&]:hidden"
      role="region"
      aria-label="Book cleaning"
    >
      <div className="grid grid-cols-2 gap-2">
        <GetFreeQuoteLink
          source="home_sticky"
          variant="primary"
          className="min-w-0 !rounded-md px-3 text-xs font-semibold uppercase tracking-wide shadow-none sm:text-sm"
        />
        <GrowthCtaLink
          href={bookHref}
          source="home_sticky_book"
          className="inline-flex min-h-12 min-w-0 items-center justify-center rounded-md border border-[#0051FF] bg-white px-3 text-xs font-semibold uppercase tracking-wide text-[#0033A1] transition hover:bg-[#EEF3FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0051FF] focus-visible:ring-offset-2 sm:text-sm"
        >
          Book now
        </GrowthCtaLink>
      </div>
    </div>
  );
}
