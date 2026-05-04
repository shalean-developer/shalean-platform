import type { Metadata } from "next";
import { AboutPageView } from "@/components/about/AboutPageView";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

const PATH = "/about";
const CANONICAL = absoluteCanonicalUrl(PATH);

export const metadata: Metadata = {
  title: "About Shalean | Trusted Home Cleaning Cape Town",
  description:
    "Vetted cleaners, transparent pricing, and reliable home cleaning across Cape Town. Learn how Shalean works and book online with upfront quotes.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: "About Shalean | Trusted Home Cleaning Cape Town",
    description:
      "Background-checked teams, clear totals before payment, and suburb hubs across the metro—book standard, deep, or move-out cleaning.",
  },
  twitter: {
    card: "summary_large_image",
    title: "About Shalean | Trusted Home Cleaning Cape Town",
    description: "Why homeowners choose Shalean: vetted cleaners, transparent pricing, same-day when routing allows.",
  },
};

export default function AboutPage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-white text-zinc-900">
      <GrowthTracking
        event="page_view"
        payload={{ page_type: "about", content_group: "marketing_about", primary_kw: "Shalean cleaning Cape Town" }}
      />
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main>
        <AboutPageView />
      </main>
      <MarketingHomeFooter />
    </div>
  );
}
