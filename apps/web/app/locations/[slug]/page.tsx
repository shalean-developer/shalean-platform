import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { ProgrammaticLocationCleaningPage } from "@/components/seo/ProgrammaticLocationCleaningPage";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { buildLocationSeoMetadata, getLocationSeo } from "@/lib/seo/capeTownSeoPages";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";

const SITE_ORIGIN = "https://www.shalean.co.za";

type Props = { params: Promise<{ slug: string }> };

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
  const title = seo?.h1 ?? `Cleaning Services in ${location.name} | Shalean`;
  const description =
    seo?.description ??
    `Book trusted cleaning services in ${location.name}, ${location.city}. Reliable home and office cleaning.`;

  if (seo) {
    const base = buildLocationSeoMetadata(seo);
    return {
      ...base,
      title,
      description,
      openGraph: base.openGraph
        ? { ...base.openGraph, title, description }
        : { type: "website", url: `${SITE_ORIGIN}${seo.path}`, title, description },
      twitter: base.twitter ? { ...base.twitter, title, description } : { card: "summary_large_image", title, description },
    };
  }

  const path = `/locations/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: `${SITE_ORIGIN}${path}`,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
  const trustStats = await getPublicReviewBannerStats();
  return (
    <MarketingLayout>
      <ProgrammaticLocationCleaningPage location={location} seo={seo} trustStats={trustStats} />
    </MarketingLayout>
  );
}
