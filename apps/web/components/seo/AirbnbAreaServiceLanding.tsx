import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { SeoBreadcrumbs } from "@/components/seo/SeoBreadcrumbs";
import type { AirbnbAreaLandingBlock } from "@/lib/seo/airbnbAreaLandingPages";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { googleReviewsServiceTrustLine } from "@/lib/seo/googleReviews";
import { getBrandSameAsForJsonLd } from "@/lib/site/brandSameAs";
import { SITE_ORIGIN, absoluteCanonicalUrl } from "@/lib/site/canonical";
import { buildSeoBookingHref, recommendedSeoExtras } from "@/lib/booking/seoBookingPrefill";
import { CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF } from "@/lib/blog/canonicalEditorialBlogLinks";

const AIRBNB_HUB = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"];

type Props = { block: AirbnbAreaLandingBlock };

export function AirbnbAreaServiceLanding({ block }: Props) {
  const pageUrl = absoluteCanonicalUrl(block.path);
  const localBusinessId = `${SITE_ORIGIN}/#localbusiness`;
  const serviceNodeId = `${pageUrl}#service`;
  const hubHref = `/locations/${block.locationHubSlug}`;
  const bookingHref = buildSeoBookingHref("details", {
    service: "airbnb",
    locationSlug: block.key,
    extras: recommendedSeoExtras("airbnb"),
    source: `seo_airbnb_area_${block.key}`,
  });
  const sameAs = getBrandSameAsForJsonLd();

  const localBusinessNode: Record<string, unknown> = {
    "@type": "LocalBusiness",
    "@id": localBusinessId,
    name: "Shalean Cleaning Services",
    url: SITE_ORIGIN,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Cape Town",
      addressCountry: "ZA",
    },
  };
  if (sameAs.length > 0) localBusinessNode.sameAs = sameAs;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      localBusinessNode,
      {
        "@type": "CleaningService",
        "@id": serviceNodeId,
        name: `${block.title.replace(/\s*\|\s*Shalean\s*$/i, "").trim()} | Shalean`,
        serviceType: "Airbnb Cleaning Service",
        url: pageUrl,
        areaServed: { "@type": "Place", name: `${block.areaName}, Cape Town, South Africa` },
        provider: { "@id": localBusinessId },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumbs`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
          { "@type": "ListItem", position: 2, name: "Services", item: absoluteCanonicalUrl("/services") },
          {
            "@type": "ListItem",
            position: 3,
            name: "Airbnb cleaning Cape Town",
            item: absoluteCanonicalUrl(AIRBNB_HUB.path),
          },
          { "@type": "ListItem", position: 4, name: block.h1, item: pageUrl },
        ],
      },
    ],
  };

  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <main className="bg-white text-zinc-900">
      <GrowthTracking event={ANALYTICS_EVENTS.PAGE_VIEW} payload={{ page_type: "seo_airbnb_area", area: block.key }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />

      <div className="mx-auto max-w-7xl px-4 pt-8">
        <SeoBreadcrumbs
          includeJsonLd={false}
          items={[
            { name: "Home", href: "/" },
            { name: "Services", href: "/services" },
            { name: "Airbnb cleaning Cape Town", href: AIRBNB_HUB.path },
            { name: block.areaName, href: block.path, current: true },
          ]}
        />
        <p className="mt-4 max-w-3xl text-sm font-medium leading-relaxed text-blue-900/90">{googleReviewsServiceTrustLine()}</p>
      </div>

      <section className="border-b border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white py-14">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean · {block.areaName}</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">{block.h1}</h1>
          <p className="mt-4 text-lg leading-relaxed text-zinc-600">{block.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <GrowthCtaLink
              href={bookingHref}
              source={`seo_airbnb_area_${block.key}_hero`}
              className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Book Airbnb turnover
            </GrowthCtaLink>
            <Link
              href={AIRBNB_HUB.path}
              className="inline-flex min-h-12 items-center rounded-xl border border-blue-200 px-6 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
            >
              Cape Town Airbnb guide
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-14">
        <div className="mx-auto max-w-4xl px-4 space-y-4 text-base leading-relaxed text-zinc-600">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Turnovers in {block.areaName}</h2>
          {block.localLead.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p>
            Every suburb rolls into the same trusted playbook on our{" "}
            <Link href={AIRBNB_HUB.path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Airbnb cleaning Cape Town service hub
            </Link>
            —scope, bedrooms, bathrooms, and add-ons lock before payment.
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/40 py-14">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Pricing context for {block.areaName}</h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-zinc-600">
            {block.pricingParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <GrowthCtaLink
            href={bookingHref}
            source={`seo_airbnb_area_${block.key}_pricing`}
            className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Get exact price for your listing
          </GrowthCtaLink>
        </div>
      </section>

      <section className="border-b border-blue-100 py-14">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Turnover checklist</h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">{block.checklistIntro}</p>
          <ul className="mt-6 space-y-3">
            {block.checklistBullets.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-blue-100 bg-white p-4 text-sm font-medium leading-relaxed text-zinc-700 shadow-sm"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-base leading-relaxed text-zinc-600">
            Want the printable-style walkthrough? Read our{" "}
            <Link href={CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Airbnb cleaning checklist for Cape Town hosts
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-zinc-50/80 py-14">
        <div className="mx-auto max-w-4xl px-4 space-y-4 text-base leading-relaxed text-zinc-600">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Keep {block.areaName} listings consistent</h2>
          {block.closingParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p>
            Explore{" "}
            <Link href={hubHref} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              cleaning services in {block.areaName}
            </Link>{" "}
            for suburb FAQs—then align turnovers with the central{" "}
            <Link href={AIRBNB_HUB.path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Airbnb cleaning services in Cape Town
            </Link>{" "}
            guide before you sync calendars.
          </p>
          <div className="not-prose flex flex-wrap gap-3 pt-4">
            <GrowthCtaLink
              href={bookingHref}
              source={`seo_airbnb_area_${block.key}_footer`}
              className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Check availability
            </GrowthCtaLink>
          </div>
        </div>
      </section>
    </main>
  );
}
