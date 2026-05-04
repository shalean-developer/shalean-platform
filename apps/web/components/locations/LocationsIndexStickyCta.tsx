"use client";

import { CTAButton } from "@/components/ui/CTAButton";

/** Fixed bottom bar on small screens — mirrors services hub pattern. */
export function LocationsIndexStickyCta() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-100 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(5,150,105,0.12)] backdrop-blur-md md:hidden print:hidden"
      role="region"
      aria-label="Book a cleaner"
    >
      <div className="mx-auto flex max-w-lg gap-2">
        <CTAButton
          href="/booking/details"
          variant="primary"
          trackSource="locations_index_sticky_price"
          className="min-h-12 flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700"
        >
          Get exact price
        </CTAButton>
        <CTAButton
          href="/booking"
          variant="secondary"
          trackSource="locations_index_sticky_book"
          className="min-h-12 flex-1 rounded-xl border-emerald-200 text-emerald-900"
        >
          Book now
        </CTAButton>
      </div>
    </div>
  );
}
