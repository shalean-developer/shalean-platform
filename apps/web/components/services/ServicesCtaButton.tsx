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
  "inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] px-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-[length:var(--ui-text-body)]";

const variants = {
  primary:
    "bg-primary text-primary-foreground shadow-[var(--ui-shadow-md)] hover:brightness-95 active:brightness-90",
  secondary:
    "border border-border bg-card text-foreground shadow-[var(--ui-shadow-sm)] hover:bg-muted active:bg-muted/80",
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
  const cls = cn(base, variants[variant], className);

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
