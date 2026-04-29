import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { SeoLocationCleaningPage } from "@/components/seo/SeoLocationCleaningPage";
import {
  buildLocationSeoMetadata,
  getLocationSeo,
  LOCATION_SEO_SLUGS,
} from "@/lib/seo/capeTownSeoPages";
type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return LOCATION_SEO_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = getLocationSeo(slug);
  if (!data) return { title: "Location | Shalean" };
  return buildLocationSeoMetadata(data);
}

export default async function LocationSeoPage({ params }: Props) {
  const { slug } = await params;
  const data = getLocationSeo(slug);
  if (!data) notFound();
  return (
    <MarketingLayout>
      <SeoLocationCleaningPage slug={data.slug} />
    </MarketingLayout>
  );
}
