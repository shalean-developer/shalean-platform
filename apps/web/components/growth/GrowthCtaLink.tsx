"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

const SEO_SERVICE_BOOKING_PATHS: Record<string, string> = {
  "/services/deep-cleaning-cape-town": "/book/deep-cleaning",
  "/services/standard-cleaning-cape-town": "/book/regular-cleaning",
  "/services/move-out-cleaning-cape-town": "/book/moving-cleaning",
  "/services/office-cleaning-cape-town": "/book/office-cleaning",
  "/services/airbnb-cleaning-cape-town": "/book/airbnb-cleaning",
  "/services/carpet-cleaning-cape-town": "/book/carpet-cleaning",
  // Window cleaning is not a Booking V2 service yet, so keep the lead in a supported flow.
  "/services/window-cleaning-cape-town": "/quote",
};

function resolveGrowthHref(href: string, pathname: string): string {
  if (href !== "/book") return href;
  return SEO_SERVICE_BOOKING_PATHS[pathname] ?? href;
}

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
  const pathname = usePathname();
  const resolvedHref = resolveGrowthHref(href, pathname);

  return (
    <Link
      href={resolvedHref}
      className={className}
      data-growth-source={source}
      {...(blogAnalyticsPlacement
        ? { "data-blog-track-cta": "1", "data-blog-cta-placement": blogAnalyticsPlacement }
        : {})}
      onClick={() => {
        beforeNavigate?.();
        trackGrowthEvent(ANALYTICS_EVENTS.START_BOOKING, {
          source,
          destination: resolvedHref,
          landing_path: pathname,
        });
      }}
    >
      {children}
    </Link>
  );
}
