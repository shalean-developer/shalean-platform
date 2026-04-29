import type { Metadata } from "next";
import StructuredData from "@/components/home/StructuredData";
import { MarketingLandingPage } from "@/components/marketing-home/MarketingLandingPage";
import { getHomePageData } from "@/lib/home/data";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";

const OG_IMAGE = "/images/marketing/cape-town-house-cleaning-kitchen.webp";

export const metadata: Metadata = {
  title: "Cleaning Services Cape Town | Shalean Cleaning Services",
  description:
    "Book trusted home and deep cleaning services in Cape Town. Professional cleaners, fast booking, spotless results.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://www.shalean.co.za/",
    title: "Cleaning Services Cape Town | Shalean Cleaning Services",
    description:
      "Professional home and deep cleaning services in Cape Town. Book trusted cleaners today.",
    images: [
      {
        url: OG_IMAGE,
        width: 1024,
        height: 576,
        alt: "Professional cleaning services in Cape Town",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Services Cape Town | Shalean",
    description: "Book trusted cleaners in Cape Town. Fast, reliable, professional.",
    images: [OG_IMAGE],
  },
};

export default async function MarketingHomePage() {
  const [{ services, locations, faqs }, reviewBanner] = await Promise.all([getHomePageData(), getPublicReviewBannerStats()]);

  return (
    <>
      <StructuredData services={services} locations={locations} faqs={faqs} reviewBanner={reviewBanner} />
      <MarketingLandingPage locations={locations} faqs={faqs} reviewBanner={reviewBanner} />
    </>
  );
}
