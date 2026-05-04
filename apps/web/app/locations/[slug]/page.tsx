import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { ProgrammaticLocationCleaningPage } from "@/components/seo/ProgrammaticLocationCleaningPage";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import {
  buildLocationPageMetaDescription,
  buildLocationPageMetaTitle,
  buildLocationSeoMetadata,
  getLocationSeo,
} from "@/lib/seo/capeTownSeoPages";
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

  if (seo) {
    return buildLocationSeoMetadata(seo);
  }

  const path = `/locations/${slug}`;
  const title = buildLocationPageMetaTitle(location.name);
  const description = buildLocationPageMetaDescription(location.name);
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
