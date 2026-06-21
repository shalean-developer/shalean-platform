import type { Metadata } from "next";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { QuoteRequestForm } from "@/components/quote/QuoteRequestForm";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/quote";
const CANONICAL = absoluteCanonicalUrl(PATH);

export const metadata: Metadata = {
  title: "Get a Free Cleaning Quote | Shalean Cape Town",
  description: clampMetaDescription(
    "Request a free, no-obligation cleaning quote for your home or office in Cape Town. Tell us what you need — we'll email your personalised quote.",
  ),
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: "Get a Free Cleaning Quote | Shalean",
    description: clampMetaDescription(
      "Free cleaning quotes for Cape Town homes and offices — personalised pricing from Shalean.",
    ),
  },
};

export default function QuoteRequestPage() {
  return (
    <div className="bg-slate-50 text-slate-900">
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{ page_type: "quote_request", content_group: "marketing_quote" }}
      />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Free quote</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Get your free cleaning quote
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">
            Tell us about your home or office and we&apos;ll send a personalised quote by email. No account
            required — accept and pay online when you&apos;re ready.
          </p>
        </div>
        <QuoteRequestForm />
        <p className="mt-8 text-center text-sm text-slate-500">
          Need a price right now?{" "}
          <a href="/book" className="font-semibold text-blue-600 hover:underline">Get an instant price online</a>
        </p>
      </main>
      <FooterSection />
    </div>
  );
}
