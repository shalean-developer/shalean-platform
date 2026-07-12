"use client";

import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

/** Mobile sticky bar on the marketing homepage. */
export function MarketingHomeStickyCta() {
  const bookHref = marketingHomeBookingHref();

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(37,99,235,0.12)] backdrop-blur-md md:hidden print:hidden [:root[data-promo-announcement]_&]:hidden"
      role="region"
      aria-label="Book cleaning"
    >
      <div className="mx-auto flex max-w-lg gap-2">
        <GetFreeQuoteLink source="home_sticky" variant="primary" className="flex-1 min-h-12 px-4" />
        <GrowthCtaLink
          href={bookHref}
          source="home_sticky_book"
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-blue-200 text-sm font-semibold text-blue-800 hover:bg-blue-50"
        >
          Book now
        </GrowthCtaLink>
      </div>
    </div>
  );
}
