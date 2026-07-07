import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { ProgrammaticLocationCleaningPage } from "@/components/seo/ProgrammaticLocationCleaningPage";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { getLocationHubMarketingReviews } from "@/lib/seo/location-hub-marketing-reviews";
import {
  buildLocationSeoMetadataAsync,
  getLocationSeo,
  resolveLocationSeoMetaFieldsAsync,
} from "@/lib/seo/capeTownSeoPages";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import {
  HOME_OG_IMAGE,
  HOME_OG_IMAGE_ALT,
  HOME_OG_IMAGE_HEIGHT,
  HOME_OG_IMAGE_WIDTH,
} from "@/lib/seo/homePageMeta";
import { getLocationHubBlogCards } from "@/lib/seo/location-hub-blog-cards";
import { resolveLocationHubUiPatch } from "@/lib/seo/resolve-location-hub-ui-patch";
import { resolveLocationTitleVariant } from "@/lib/seo/resolve-location-title-variant";
import { SITE_ORIGIN, absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

type Props = { params: Promise<{ slug: string }> };

/** Only pre-rendered hub slugs from `location-hubs.json`; unknown `[slug]` → 404 at build/runtime. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return CAPE_TOWN_LOCATIONS.map((loc) => ({
    slug: loc.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const location = CAPE_TOWN_LOCATIONS.find((loc) => loc.slug === slug);
  if (!location) {
    return { title: "Location | Shalean" };
  }

  const seo = getLocationSeo(slug) ?? null;

  const path = `/locations/${slug}`;

  if (seo) {
    return buildLocationSeoMetadataAsync(seo, location);
  }

  const { title, description } = await resolveLocationSeoMetaFieldsAsync(null, location);
  return {
    title,
    description,
    robots: SEO_INDEX_FOLLOW,
    alternates: { canonical: absoluteCanonicalUrl(path) },
    openGraph: {
      type: "website",
      url: `${SITE_ORIGIN}${path}`,
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
  };
}

export default async function LocationSeoPage({ params }: Props) {
  const { slug } = await params;
  const location = CAPE_TOWN_LOCATIONS.find((loc) => loc.slug === slug);
  if (!location) notFound();

  const seo = getLocationSeo(location.slug) ?? null;
  if (process.env.NODE_ENV === "development") {
    console.log("LOCATION:", location.slug);
    console.log("SEO:", seo ? { slug: seo.slug, path: seo.path } : null);
  }
  const [trustStats, marketingReviewSnippets, metaFields, blogCards, titleVariant, hubUiPatch] = await Promise.all([
    getPublicReviewBannerStats(),
    getLocationHubMarketingReviews(location.name, 4),
    resolveLocationSeoMetaFieldsAsync(seo, location),
    getLocationHubBlogCards(location.name),
    resolveLocationTitleVariant(slug),
    resolveLocationHubUiPatch(slug),
  ]);
  return (
    <MarketingLayout>
      <ProgrammaticLocationCleaningPage
        location={location}
        seo={seo}
        trustStats={trustStats}
        metaDescription={metaFields.description}
        blogCards={blogCards}
        titleVariant={titleVariant}
        swapHeroBookCtas={hubUiPatch.swapHeroBookCtas}
        marketingReviewSnippets={marketingReviewSnippets}
      />
    </MarketingLayout>
  );
}
