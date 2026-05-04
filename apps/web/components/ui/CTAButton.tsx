"use client";

import type { ReactNode } from "react";
import { ServicesCtaButton } from "@/components/services/ServicesCtaButton";

type Variant = "primary" | "secondary" | "ghostOnDark";

type Props = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  /** Passed through to `GrowthCtaLink` when booking/pricing destinations need attribution. */
  trackSource?: string;
  seoHubCta?: { cta_location: string; cta_label: string; cta_kind: string };
  seoPricingInteraction?: { interaction: string; label?: string };
  seoHubServiceCardBook?: { service_name: string };
};

/**
 * Generic CTA — thin wrapper over booking-aware `ServicesCtaButton` (tracking + variants).
 */
export function CTAButton({
  href,
  children,
  variant = "primary",
  className,
  trackSource,
  seoHubCta,
  seoPricingInteraction,
  seoHubServiceCardBook,
}: Props) {
  return (
    <ServicesCtaButton
      href={href}
      variant={variant}
      className={className}
      trackSource={trackSource}
      seoHubCta={seoHubCta}
      seoPricingInteraction={seoPricingInteraction}
      seoHubServiceCardBook={seoHubServiceCardBook}
    >
      {children}
    </ServicesCtaButton>
  );
}
