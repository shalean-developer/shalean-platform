import type { Metadata } from "next";
import { Suspense } from "react";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { MarketingHomeDbSections } from "@/components/marketing-home/MarketingHomeDbSections";
import { MarketingHomeDbSectionsFallback } from "@/components/marketing-home/MarketingHomeDbSectionsFallback";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingHomeStickyCtaClient } from "@/components/marketing-home/MarketingHomeStickyCtaClient";
import { MarketingStickyTrustBadge } from "@/components/marketing-home/MarketingStickyTrustBadge";
import { MarketingHomeHeroSection } from "@/components/marketing-home/sections/MarketingHomeHeroSection";
import { PromotionFeaturedCard } from "@/components/promotions/PromotionFeaturedCard";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingHomeMainPadding } from "@/lib/marketing/marketingMobileLayout";
import {
  HOME_CANONICAL,
  HOME_OPEN_GRAPH,
  HOME_PAGE_META_DESCRIPTION,
  HOME_PAGE_TITLE,
  HOME_TWITTER,
} from "@/lib/seo/homePageMeta";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

export const metadata: Metadata = {
  title: HOME_PAGE_TITLE,
  description: HOME_PAGE_META_DESCRIPTION,
  robots: SEO_INDEX_FOLLOW,
  alternates: {
    canonical: HOME_CANONICAL,
    languages: { "en-ZA": HOME_CANONICAL },
  },
  openGraph: HOME_OPEN_GRAPH,
  twitter: HOME_TWITTER,
};

export default function MarketingHomePage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-white text-slate-900">
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main className={marketingHomeMainPadding}>
        <MarketingHomeHeroSection />
        <PromotionFeaturedCard />
        <Suspense fallback={<MarketingHomeDbSectionsFallback />}>
          <MarketingHomeDbSections />
        </Suspense>
      </main>
      <FooterSection stackFloats />
      <MarketingStickyTrustBadge />
      <MarketingHomeStickyCtaClient />
    </div>
  );
}
