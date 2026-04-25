import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Home Cleaning Services Cape Town | Shalean",
  },
  description:
    "Book trusted home cleaning services in Cape Town with Shalean. Get transparent pricing, vetted cleaners, flexible add-ons, and a fast online booking flow.",
  keywords: [
    "home cleaning services Cape Town",
    "Shalean cleaning",
    "standard cleaning Cape Town",
    "deep cleaning Cape Town",
    "Airbnb cleaning Cape Town",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Home Cleaning Services Cape Town | Shalean",
    description:
      "Book vetted Shalean cleaners across Cape Town with transparent pricing, flexible extras, and secure online checkout.",
    type: "website",
    url: "/",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
