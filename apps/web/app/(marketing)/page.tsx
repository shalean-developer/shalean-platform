import type { Metadata } from "next";
import StructuredData from "@/components/home/StructuredData";
import { MarketingLandingPage } from "@/components/marketing-home/MarketingLandingPage";
import { getHomePageData } from "@/lib/home/data";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";

export const metadata: Metadata = {
  title: "Book trusted home cleaning services in Cape Town",
  description:
    "Professional cleaners for your home or office in Cape Town. Book in 60 seconds — vetted teams, insured visits, instant pricing.",
  alternates: { canonical: "/" },
};

export default async function MarketingHomePage() {
  const [{ services, locations, faqs }, reviewBanner] = await Promise.all([getHomePageData(), getPublicReviewBannerStats()]);

  return (
    <>
      <StructuredData services={services} locations={locations} faqs={faqs} />
      <MarketingLandingPage locations={locations} faqs={faqs} reviewBanner={reviewBanner} />
    </>
  );
}
