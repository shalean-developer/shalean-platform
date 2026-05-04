"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

export function GrowthCtaLink({
  href,
  className,
  children,
  source,
  blogAnalyticsPlacement,
  beforeNavigate,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  source: string;
  /** When set, marks the link for `BlogEngagementAnalytics` (placement label). */
  blogAnalyticsPlacement?: string;
  /** Fires immediately before `start_booking` (e.g. SEO `seo_cta_click`). */
  beforeNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      className={className}
      {...(blogAnalyticsPlacement
        ? { "data-blog-track-cta": "1", "data-blog-cta-placement": blogAnalyticsPlacement }
        : {})}
      onClick={() => {
        beforeNavigate?.();
        trackGrowthEvent("start_booking", { source });
      }}
    >
      {children}
    </Link>
  );
}
