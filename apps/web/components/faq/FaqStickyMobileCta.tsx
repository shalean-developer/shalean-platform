"use client";

import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

export function FaqStickyMobileCta() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-100 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(5,150,105,0.12)] backdrop-blur-md md:hidden print:hidden"
      role="region"
      aria-label="Book cleaning"
    >
      <div className="mx-auto flex max-w-lg gap-2">
        <GetFreeQuoteLink source="faq_sticky" variant="primary" className="flex-1 min-h-12 bg-emerald-600 hover:bg-emerald-700 px-4" />
        <GrowthCtaLink
          href="/book"
          source="faq_sticky_book"
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-emerald-200 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
        >
          Book
        </GrowthCtaLink>
      </div>
    </div>
  );
}
