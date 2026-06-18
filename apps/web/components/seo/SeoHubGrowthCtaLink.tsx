"use client";

import type { ReactNode } from "react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { trackSeoCtaClick, trackSeoPricingInteraction, type SeoLocationAnalyticsBase } from "@/lib/analytics/track";

type Props = {
  href: string;
  source: string;
  className?: string;
  children: ReactNode;
  ctx: SeoLocationAnalyticsBase;
  ctaLocation: string;
  ctaLabel: string;
  ctaKind: "book_now" | "get_price" | "compare" | "see_price_book" | string;
  /** When set, also records `seo_pricing_interaction` (e.g. pricing table CTAs). */
  pricingInteraction?: { interaction: string; label?: string };
};

export function SeoHubGrowthCtaLink({
  href,
  source,
  className,
  children,
  ctx,
  ctaLocation,
  ctaLabel,
  ctaKind,
  pricingInteraction,
}: Props) {
  const bookingHref = href === "/booking" || href === "/booking/details" ? "/book" : href;

  return (
    <GrowthCtaLink
      href={bookingHref}
      source={source}
      className={className}
      beforeNavigate={() => {
        if (pricingInteraction) {
          trackSeoPricingInteraction({
            interaction: pricingInteraction.interaction,
            surface: "location_hub",
            href: bookingHref,
            label: pricingInteraction.label ?? ctaLabel,
          });
        }
        trackSeoCtaClick({
          ...ctx,
          href: bookingHref,
          cta_location: ctaLocation,
          cta_label: ctaLabel,
          cta_kind: ctaKind,
        });
      }}
    >
      {children}
    </GrowthCtaLink>
  );
}
