import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { Stage19IntentLanding } from "@/components/seo/stage19/Stage19IntentLanding";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import {
  findStage19RegistryRow,
  isStage19IntentSegment,
  SEO_STAGE19_REGISTRY,
  stage19IntentLabel,
} from "@/lib/seo/seoPageRegistry";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import {
  HOME_OG_IMAGE,
  HOME_OG_IMAGE_ALT,
  HOME_OG_IMAGE_HEIGHT,
  HOME_OG_IMAGE_WIDTH,
} from "@/lib/seo/homePageMeta";

/**
 * Stage 19 programmatic landings: `/{intentSegment}/{bookingAreaSlug}` (e.g. `/deep-cleaning/sea-point`).
 * Folder must stay under `app/[city]/` — Next.js requires one param name for all sibling `[param]` roots.
 * Here `params.city` holds the **intent segment**, not a geographic city.
 */
type Props = { params: Promise<{ city: string; suburb: string }> };

export function generateStaticParams() {
  return SEO_STAGE19_REGISTRY.map((r) => ({
    city: r.intentSegment,
    suburb: r.suburbSlug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: intentSegment, suburb } = await params;
  if (!isStage19IntentSegment(intentSegment)) return { title: "Shalean Cleaning" };
  const row = findStage19RegistryRow(intentSegment, suburb);
  if (!row) return { title: "Shalean Cleaning" };

  const label = stage19IntentLabel(row.intentSegment);
  const title = `${label} ${row.suburbDisplayName} | Book Online | Shalean`;
  const description = clampMetaDescription(
    `Book ${label.toLowerCase()} in ${row.suburbDisplayName}, Cape Town. Instant quotes, vetted cleaners, secure Paystack checkout.`,
  );
  const canonicalUrl = absoluteCanonicalUrl(row.canonicalPath);

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      locale: "en_ZA",
      siteName: "Shalean Cleaning Services",
      title,
      description,
      images: [
        {
          url: HOME_OG_IMAGE,
          width: HOME_OG_IMAGE_WIDTH,
          height: HOME_OG_IMAGE_HEIGHT,
          alt: HOME_OG_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [HOME_OG_IMAGE],
    },
    robots: SEO_INDEX_FOLLOW,
  };
}

export default async function Stage19ServiceLocationPage({ params }: Props) {
  const { city: intentSegment, suburb } = await params;
  if (!isStage19IntentSegment(intentSegment)) notFound();
  const row = findStage19RegistryRow(intentSegment, suburb);
  if (!row) notFound();

  const trust = await getPublicReviewBannerStats();
  const trustStats = trust ? { avgRating: trust.avgRating, reviewCount: trust.reviewCount } : {};

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${absoluteCanonicalUrl(row.canonicalPath)}#service`,
        name: `${stage19IntentLabel(row.intentSegment)} — ${row.suburbDisplayName}`,
        serviceType: stage19IntentLabel(row.intentSegment),
        areaServed: { "@type": "City", name: "Cape Town", containedInPlace: { "@type": "Country", name: "South Africa" } },
        provider: { "@type": "Organization", name: "Shalean", url: absoluteCanonicalUrl("/") },
        url: absoluteCanonicalUrl(row.canonicalPath),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteCanonicalUrl("/") },
          {
            "@type": "ListItem",
            position: 2,
            name: `${stage19IntentLabel(row.intentSegment)} ${row.suburbDisplayName}`,
            item: absoluteCanonicalUrl(row.canonicalPath),
          },
        ],
      },
    ],
  };

  return (
    <MarketingLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{
          page_type: "seo_stage19_service_location",
          seo_intent_segment: row.intentSegment,
          seo_suburb_slug: row.suburbSlug,
          seo_priority: row.priority,
          content_group: "stage19_programmatic",
        }}
      />
      <Stage19IntentLanding row={row} trustStats={trustStats} />
    </MarketingLayout>
  );
}
