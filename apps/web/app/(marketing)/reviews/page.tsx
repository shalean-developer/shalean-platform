import type { Metadata } from "next";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingGoogleReviewsBand } from "@/components/marketing-home/sections/MarketingGoogleReviewsBand";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

export const metadata: Metadata = {
  title: "Google Reviews | Shalean Cleaning Services Cape Town",
  description:
    "See Shalean’s Google Business Profile rating and verified homeowner feedback—punctual teams, clear quotes, and thorough cleans across Cape Town.",
  alternates: { canonical: "https://www.shalean.co.za/reviews" },
};

export default function ReviewsPage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-white text-slate-900">
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main>
        <MarketingGoogleReviewsBand />
      </main>
      <MarketingHomeFooter />
    </div>
  );
}
