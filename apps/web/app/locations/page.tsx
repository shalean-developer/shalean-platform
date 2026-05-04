import type { Metadata } from "next";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { LocationsIndexView } from "@/components/locations/LocationsIndexView";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

const PATH = "/locations";
const CANONICAL_ABSOLUTE = absoluteCanonicalUrl(PATH);

export const metadata: Metadata = {
  title: "Cleaning Services Across Cape Town | Suburb Hubs | Shalean",
  description:
    "Find trusted cleaners in your Cape Town suburb—transparent pricing, instant booking, and local hub guides for Sea Point, Claremont, Rondebosch, and more.",
  alternates: { canonical: CANONICAL_ABSOLUTE },
  openGraph: {
    type: "website",
    url: CANONICAL_ABSOLUTE,
    title: "Cleaning Services Across Cape Town | Shalean",
    description:
      "Browse suburb hubs, compare services, and book standard, deep, or move-out cleaning with upfront quotes.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Services Across Cape Town | Shalean",
    description:
      "Find your area, open a local hub, and book cleaning with transparent pricing across Cape Town.",
  },
};

export default function LocationsIndexPage() {
  return (
    <MarketingLayout>
      <LocationsIndexView />
    </MarketingLayout>
  );
}
