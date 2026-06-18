"use client";

import { CTAButton } from "@/components/ui/CTAButton";

/** Fixed bottom bar — primary conversion path on small screens. */
export function ServicesStickyMobileCta() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(37,99,235,0.08)] backdrop-blur-md md:hidden"
      role="region"
      aria-label="Book a cleaner"
    >
      <div className="mx-auto flex max-w-[1100px] gap-2 px-1">
        <CTAButton
          href="/book"
          variant="primary"
          trackSource="services_hub_sticky_book"
          seoHubCta={{ cta_location: "sticky_bar", cta_label: "Book now", cta_kind: "book_now" }}
          className="min-h-12 flex-1 rounded-xl"
        >
          Book now
        </CTAButton>
        <CTAButton
          href="/book"
          variant="secondary"
          trackSource="services_hub_sticky_price"
          seoHubCta={{ cta_location: "sticky_bar", cta_label: "Get price", cta_kind: "get_price" }}
          className="min-h-12 flex-1 rounded-xl"
        >
          Get price
        </CTAButton>
      </div>
    </div>
  );
}
