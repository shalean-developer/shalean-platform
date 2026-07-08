import type { Metadata } from "next";
import { Suspense } from "react";
import { ReferralLandingRouter } from "@/components/referrals/ReferralLandingRouter";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { clipSerpTitle } from "@/lib/seo/metaTitle";
import {
  HOME_OG_IMAGE,
  HOME_OG_IMAGE_ALT,
  HOME_OG_IMAGE_HEIGHT,
  HOME_OG_IMAGE_WIDTH,
} from "@/lib/seo/homePageMeta";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/refer";
const CANONICAL = absoluteCanonicalUrl(PATH);
const REFER_OG_IMAGE = absoluteCanonicalUrl(HOME_OG_IMAGE);
const TITLE = clipSerpTitle("Refer a Friend | Earn Cleaning Credit | Shalean");
const DESC = clampMetaDescription(
  "Refer friends to Shalean Cleaning Services and earn Cleaning Credit towards your next booking. No cash. Rewards are credit only, issued after your friend's first paid clean.",
);

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL, languages: { "en-ZA": CANONICAL } },
  openGraph: {
    type: "website",
    url: CANONICAL,
    locale: "en_ZA",
    siteName: "Shalean Cleaning Services",
    title: TITLE,
    description: DESC,
    images: [{ url: REFER_OG_IMAGE, width: HOME_OG_IMAGE_WIDTH, height: HOME_OG_IMAGE_HEIGHT, alt: HOME_OG_IMAGE_ALT }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [REFER_OG_IMAGE] },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: TITLE,
  description: DESC,
  url: CANONICAL,
  isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: absoluteCanonicalUrl("/") },
  about: {
    "@type": "Offer",
    name: "Shalean Referral Program",
    description: "Earn Cleaning Credit when friends complete their first paid booking.",
    priceCurrency: "ZAR",
  },
};

export default function ReferPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Suspense fallback={<div className="min-h-screen animate-pulse bg-white" />}>
        <ReferralLandingRouter />
      </Suspense>
    </>
  );
}
