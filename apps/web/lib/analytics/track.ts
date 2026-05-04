/**
 * SEO growth analytics — thin helpers over {@link trackGrowthEvent}.
 * Persists to `user_events` via `/api/analytics/event` (+ optional GA4 via `gtag` when configured).
 *
 * Example payloads (stored in `payload` JSON):
 *
 * ```
 * seo_location_scroll: {
 *   depth: 50,
 *   page_slug: "sea-point-cleaning-services",
 *   suburb: "Sea Point",
 *   region: "Atlantic Seaboard",
 *   title_variant: "B",
 *   page_type: "seo_location"
 * }
 *
 * seo_cta_click: {
 *   cta_location: "hero",
 *   cta_label: "Book a cleaner in Sea Point",
 *   cta_kind: "book_now",
 *   href: "/booking/details",
 *   page_slug: "sea-point-cleaning-services",
 *   suburb: "Sea Point"
 * }
 *
 * seo_service_card_click: {
 *   click_type: "learn_more",
 *   service_name: "Deep Cleaning",
 *   surface: "services_hub",
 *   href: "/services/deep-cleaning-cape-town"
 * }
 *
 * seo_faq_expand: {
 *   question: "How much does cleaning cost?",
 *   surface: "location_hub",
 *   page_slug: "claremont-cleaning-services"
 * }
 *
 * seo_pricing_interaction: {
 *   interaction: "get_exact_price_click",
 *   surface: "services_hub",
 *   href: "/booking/details"
 * }
 * ```
 */

"use client";

import type { LocationTitleVariantId } from "@/lib/seo/location-title-variants";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

export type SeoLocationAnalyticsBase = {
  page_slug: string;
  suburb: string;
  region: string;
  title_variant?: LocationTitleVariantId;
  page_type?: "seo_location" | "services_hub";
};

/** Payload base for `/services` hub CTAs (not a suburb SEO page). */
export const SERVICES_HUB_ANALYTICS_CTX: SeoLocationAnalyticsBase = {
  page_slug: "services",
  suburb: "Cape Town",
  region: "Western Cape",
  page_type: "services_hub",
};

export type SeoScrollDepth = 25 | 50 | 75 | 100;

export function trackSeoLocationScroll(
  depth: SeoScrollDepth,
  ctx: SeoLocationAnalyticsBase & { hub_tier?: string; seo_priority?: number | string },
): void {
  trackGrowthEvent("seo_location_scroll", {
    depth,
    page_slug: ctx.page_slug,
    suburb: ctx.suburb,
    region: ctx.region,
    title_variant: ctx.title_variant,
    page_type: ctx.page_type ?? ("seo_location" as const),
    hub_tier: ctx.hub_tier,
    seo_priority: ctx.seo_priority != null ? String(ctx.seo_priority) : undefined,
  });
}

export function trackSeoCtaClick(
  ctx: SeoLocationAnalyticsBase & {
    cta_location: string;
    cta_label: string;
    cta_kind: "book_now" | "get_price" | "compare" | "see_price_book" | string;
    href: string;
  },
): void {
  trackGrowthEvent("seo_cta_click", {
    page_slug: ctx.page_slug,
    suburb: ctx.suburb,
    region: ctx.region,
    title_variant: ctx.title_variant,
    page_type: ctx.page_type ?? ("seo_location" as const),
    cta_location: ctx.cta_location,
    cta_label: ctx.cta_label,
    cta_kind: ctx.cta_kind,
    href: ctx.href,
  });
}

export function trackSeoServiceCardClick(payload: {
  click_type: "learn_more" | "book" | "tile";
  service_name: string;
  surface: "services_hub" | "location_hub";
  href: string;
  page_slug?: string;
  suburb?: string;
}): void {
  trackGrowthEvent("seo_service_card_click", payload);
}

export function trackSeoFaqExpand(payload: {
  question: string;
  surface: "location_hub" | "services_hub";
  page_slug?: string;
  suburb?: string;
}): void {
  trackGrowthEvent("seo_faq_expand", payload);
}

export function trackSeoPricingInteraction(payload: {
  interaction: "get_exact_price_click" | string;
  surface: "services_hub" | string;
  href: string;
  label?: string;
}): void {
  trackGrowthEvent("seo_pricing_interaction", payload);
}
