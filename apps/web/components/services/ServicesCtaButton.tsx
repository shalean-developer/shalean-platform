"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import {
  SERVICES_HUB_ANALYTICS_CTX,
  trackSeoCtaClick,
  trackSeoPricingInteraction,
  trackSeoServiceCardClick,
} from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

const base =
  "inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:text-[15px]";

const variants = {
  primary: "bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800",
  secondary:
    "border border-blue-200 bg-white text-blue-900 shadow-sm hover:border-blue-300 hover:bg-blue-50 active:bg-blue-100",
  ghostOnDark: "border border-white/30 bg-white/10 text-white hover:bg-white/15",
} as const;

type Props = {
  href: string;
  variant: keyof typeof variants;
  children: ReactNode;
  className?: string;
  /** When set, wraps booking destinations with growth tracking. */
  trackSource?: string;
  /** Serializable SEO hub attribution (works from Server Components). */
  seoHubCta?: { cta_location: string; cta_label: string; cta_kind: string };
  /** When set with `trackSource`, also emits `seo_pricing_interaction`. */
  seoPricingInteraction?: { interaction: string; label?: string };
  /** Emits `seo_service_card_click` with `click_type: "book"` before hub CTA payload. */
  seoHubServiceCardBook?: { service_name: string };
};

export function ServicesCtaButton({
  href,
  variant,
  children,
  className,
  trackSource,
  seoHubCta,
  seoPricingInteraction,
  seoHubServiceCardBook,
}: Props) {
  // Tailwind utility order is stylesheet-driven, not last-class-wins. When a caller
  // explicitly requests the established inverse white/blue treatment, avoid layering
  // the primary blue/white colour utilities underneath it or the text can render white
  // on a white button.
  const classTokens = className?.split(/\s+/) ?? [];
  const requestsInversePrimary =
    variant === "primary" &&
    classTokens.includes("bg-white") &&
    classTokens.includes("text-blue-900");
  const resolvedVariant = requestsInversePrimary ? "secondary" : variant;
  const cls = cn(base, variants[resolvedVariant], className);

  if (trackSource) {
    return (
      <GrowthCtaLink
        href={href}
        source={trackSource}
        className={cls}
        beforeNavigate={() => {
          if (seoPricingInteraction) {
            trackSeoPricingInteraction({
              interaction: seoPricingInteraction.interaction,
              surface: "services_hub",
              href,
              label: seoPricingInteraction.label,
            });
          }
          if (seoHubServiceCardBook) {
            trackSeoServiceCardClick({
              click_type: "book",
              service_name: seoHubServiceCardBook.service_name,
              surface: "services_hub",
              href,
            });
          }
          if (seoHubCta) {
            trackSeoCtaClick({
              ...SERVICES_HUB_ANALYTICS_CTX,
              href,
              cta_location: seoHubCta.cta_location,
              cta_label: seoHubCta.cta_label,
              cta_kind: seoHubCta.cta_kind,
            });
          }
        }}
      >
        {children}
      </GrowthCtaLink>
    );
  }

  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
