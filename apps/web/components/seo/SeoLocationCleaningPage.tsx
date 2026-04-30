import Link from "next/link";
import { Sparkles } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { publicTrustRatingBadgeLine } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import type { LocationSeoSlug } from "@/lib/seo/capeTownSeoPages";
import {
  LOCATION_SEO_PAGES,
  LOCATION_SEO_SHORT_PLACE,
  locationHubServiceLinksCapeTownAnchors,
} from "@/lib/seo/capeTownSeoPages";

type Props = { slug: LocationSeoSlug; trustStats: PublicReviewBannerStats | null };

export function SeoLocationCleaningPage({ slug, trustStats }: Props) {
  const data = LOCATION_SEO_PAGES[slug];
  const placeName = LOCATION_SEO_SHORT_PLACE[slug];
  const hubServiceLinks = locationHubServiceLinksCapeTownAnchors();
  const regionEyebrow =
    slug === "sea-point-cleaning-services" ? "Cape Town · Atlantic Seaboard" : "Cape Town · Southern Suburbs";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: data.h1,
        description: data.description,
        url: `https://www.shalean.co.za${data.path}`,
        isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: "https://www.shalean.co.za" },
      },
    ],
  };

  return (
    <main className="bg-white text-zinc-900">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_location", slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="border-b border-emerald-100 bg-gradient-to-b from-emerald-50/60 via-white to-white py-14">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{regionEyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">{data.h1}</h1>
          <p className="mt-4 text-lg leading-relaxed text-zinc-600">{data.description}</p>
          <p className="mt-3 text-sm font-medium text-zinc-700">
            {publicTrustRatingBadgeLine(trustStats)} · 4,500+ homes cleaned across Cape Town
          </p>
          <GrowthCtaLink
            href="/booking?step=entry"
            source={`seo_loc_${slug}_hero`}
            className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Book {data.bookingLabel}
          </GrowthCtaLink>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Cleaning in this part of Cape Town</h2>
          <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
            {data.intro.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-100 bg-zinc-50/50 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Local context</h2>
          <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
            {data.localAngle.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Why Cape Town customers choose Shalean</h2>
          <ul className="mt-8 space-y-4">
            {data.whyChoose.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-700 shadow-sm">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-zinc-100 bg-emerald-50/30 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Our services in {placeName}</h2>
          <p className="mt-3 text-zinc-600">
            Browse Cape Town service guides you can book for {placeName}: each link opens the citywide page for that service so you can compare scope, then enter your {placeName} address at checkout for an accurate quote.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hubServiceLinks.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="block rounded-2xl border border-emerald-100 bg-white p-4 text-sm font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-zinc-900 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Book {data.bookingLabel} today</h2>
        <p className="mx-auto mt-3 max-w-lg text-zinc-300">Tell us your Cape Town address and home details—pricing updates instantly before you confirm.</p>
        <GrowthCtaLink
          href="/booking?step=entry"
          source={`seo_loc_${slug}_footer`}
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-zinc-900 transition hover:bg-zinc-100"
        >
          Open booking
        </GrowthCtaLink>
      </section>
    </main>
  );
}
