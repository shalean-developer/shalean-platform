import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { SeoCapeTownServicePage } from "@/components/seo/SeoCapeTownServicePage";
import {
  buildCapeTownServiceMetadata,
  CAPE_TOWN_SEO_SERVICE_SLUGS,
  getCapeTownServiceSeo,
} from "@/lib/seo/capeTownSeoPages";

type Props = { params: Promise<{ service: string }> };

export function generateStaticParams() {
  return CAPE_TOWN_SEO_SERVICE_SLUGS.map((service) => ({ service }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service: slug } = await params;
  if (!slug.endsWith("-cape-town")) notFound();
  const capeTownSeo = getCapeTownServiceSeo(slug);
  if (!capeTownSeo) notFound();
  return buildCapeTownServiceMetadata(capeTownSeo);
}

export default async function ServicePage({ params }: Props) {
  const { service: slug } = await params;
  if (!slug.endsWith("-cape-town")) notFound();
  const capeTownSeo = getCapeTownServiceSeo(slug);
  if (!capeTownSeo) notFound();
  return (
    <MarketingLayout>
      <SeoCapeTownServicePage slug={capeTownSeo.slug} />
    </MarketingLayout>
  );
}
