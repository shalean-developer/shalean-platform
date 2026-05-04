import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, MapPin, Sparkles } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { getAreaProgrammaticBlogLinksForCapeTownService } from "@/lib/blog/programmaticPosts";
import { publicTrustRatingBadgeLine } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import type { CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import { AirbnbCapeTownServiceExtendedContent } from "@/components/seo/AirbnbCapeTownServiceExtendedContent";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { SeoBreadcrumbs } from "@/components/seo/SeoBreadcrumbs";
import {
  CAPE_TOWN_SERVICE_SEO,
  capeTownSeoLocationLinks,
  resolveCapeTownServiceSchemaFields,
  serviceHubLocationLinks,
} from "@/lib/seo/capeTownSeoPages";
import { googleReviewsServiceTrustLine } from "@/lib/seo/googleReviews";
import { getBrandSameAsForJsonLd } from "@/lib/site/brandSameAs";
import { SITE_ORIGIN, absoluteCanonicalUrl } from "@/lib/site/canonical";

type Props = { slug: CapeTownSeoServiceSlug; trustStats: PublicReviewBannerStats | null };

export function SeoCapeTownServicePage({ slug, trustStats }: Props) {
  const data = CAPE_TOWN_SERVICE_SEO[slug];
  const bookingPath = data.bookingPath ?? "/booking/details";
  const introHeading = data.introSectionHeading ?? "How this service works in Cape Town";
  const areasHeading = "Areas we serve";
  const areasIntro =
    data.areasSectionIntro ??
    "Explore suburb-focused cleaning pages across the Southern Suburbs—each hub explains local access and typical homes, then links back to this Cape Town service guide so you can compare scope before booking.";
  const hubLocationLinks = serviceHubLocationLinks(slug);
  const areaProgrammaticBlogLinks = getAreaProgrammaticBlogLinksForCapeTownService(slug);

  const heroCopy = (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">{data.h1}</h1>
      <p className="mt-4 text-lg leading-relaxed text-zinc-600">{data.description}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <GrowthCtaLink
          href={bookingPath}
          source={`seo_ct_${slug}_hero`}
          className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          {slug === "airbnb-cleaning-cape-town" ? "Book Airbnb cleaner" : `Book ${data.bookingLabel}`}
        </GrowthCtaLink>
        <Link
          href={`${data.path}#included`}
          className="inline-flex min-h-12 items-center rounded-xl border border-blue-200 px-6 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          What&apos;s included
        </Link>
      </div>
    </>
  );

  const pageUrl = absoluteCanonicalUrl(data.path);
  const localBusinessId = `${SITE_ORIGIN}/#localbusiness`;
  const serviceNodeId = `${pageUrl}#service`;
  const { schemaName, schemaServiceType } = resolveCapeTownServiceSchemaFields(slug, data);
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

  const breadcrumbEntity = {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: "Services", item: absoluteCanonicalUrl("/services") },
      { "@type": "ListItem", position: 3, name: data.h1, item: pageUrl },
    ],
  };

  const faqPageEntity = {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    url: pageUrl,
    mainEntity: data.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };

  /** No aggregateRating / Review — trust copy is visible; avoids invalid Review snippets. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      localBusinessNode,
      {
        "@type": "CleaningService",
        "@id": serviceNodeId,
        name: schemaName,
        serviceType: schemaServiceType,
        url: pageUrl,
        areaServed: { "@type": "Place", name: "Cape Town, South Africa" },
        provider: { "@id": localBusinessId },
      },
      breadcrumbEntity,
      faqPageEntity,
    ],
  };

  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <main className="bg-white text-zinc-900">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_cape_town_service", slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />

      <div className="mx-auto max-w-7xl px-4 pt-8">
        <SeoBreadcrumbs
          includeJsonLd={false}
          items={[
            { name: "Home", href: "/" },
            { name: "Services", href: "/services" },
            { name: data.h1, href: data.path, current: true },
          ]}
        />
        <p className="mt-4 max-w-3xl text-sm font-medium leading-relaxed text-blue-900/90">{googleReviewsServiceTrustLine()}</p>
      </div>

      <section className="border-b border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white py-14">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-x-10">
            <div className="min-w-0 max-w-2xl lg:max-w-none">{heroCopy}</div>
            <div className="relative aspect-[4/3] w-full min-h-0 min-w-0 overflow-hidden rounded-2xl shadow-lg">
              <Image
                src={data.heroImage.src}
                alt={data.heroImage.alt}
                fill
                className="z-0 object-cover"
                sizes="(max-width: 1024px) 100vw, (max-width: 1280px) 50vw, 704px"
                priority
                fetchPriority="high"
              />
              <div
                className="pointer-events-none absolute inset-0 z-[1] rounded-2xl bg-gradient-to-t from-black/20 to-transparent"
                aria-hidden
              />
              <div className="absolute bottom-2.5 left-2.5 z-[2] rounded-xl bg-white px-3 py-1.5 shadow-lg sm:bottom-4 sm:left-4 sm:px-4 sm:py-2">
                <p className="text-xs font-semibold leading-snug text-zinc-900 sm:text-sm">4,500+ Homes Cleaned</p>
                <p className="mt-0.5 text-[10px] leading-snug text-gray-500 sm:text-xs">
                  {publicTrustRatingBadgeLine(trustStats)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{introHeading}</h2>
          <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
            {data.explanation.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {slug === "deep-cleaning-cape-town" ? (
              <p>
                Hosting short-stay guests? Our{" "}
                <Link href={CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  Airbnb turnover cleaning
                </Link>{" "}
                scope is tuned for tight changeovers—deep cleans still matter when ovens and grout lag behind turnover cycles.
              </p>
            ) : null}
            {slug === "standard-cleaning-cape-town" ? (
              <p>
                If you list on Airbnb, compare dedicated{" "}
                <Link href={CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  airbnb cleaning Cape Town
                </Link>{" "}
                turnovers alongside recurring standard visits—guest expectations are closer to hospitality than weekly home upkeep.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section id="included" className="scroll-mt-24 border-b border-blue-100 bg-blue-50/40 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">What&apos;s included</h2>
          <p className="mt-3 text-zinc-600">Exact scope follows your online quote—below is the typical checklist for this service type.</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {data.included.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl border border-blue-100 bg-white p-4 text-sm font-medium text-zinc-700 shadow-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Benefits for Cape Town customers</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {data.benefits.map((b) => (
              <div key={b.title} className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                <Sparkles className="h-6 w-6 text-blue-600" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-zinc-900">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data.targetAudience ? (
        <section className="border-b border-blue-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{data.targetAudience.heading}</h2>
            <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
              {data.targetAudience.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {slug === "airbnb-cleaning-cape-town" ? (
        <AirbnbCapeTownServiceExtendedContent bookingPath={bookingPath} />
      ) : null}

      <section className="border-b border-blue-100 bg-blue-50/30 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900">
            <MapPin className="h-6 w-6 text-blue-600" aria-hidden />
            {areasHeading}
          </h2>
          <p className="mt-3 text-zinc-600">{areasIntro}</p>
          <ul className="mt-8 flex flex-wrap gap-3">
            {hubLocationLinks.map((loc) => (
              <li key={loc.href}>
                <Link
                  href={loc.href}
                  className="inline-flex rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-50"
                >
                  {loc.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-zinc-600">
            Explore more suburb hubs for parking, building access, and typical layouts—start with{" "}
            {capeTownSeoLocationLinks()
              .slice(0, 6)
              .map((l, i, arr) => (
                <span key={l.href}>
                  {i > 0 ? (i === arr.length - 1 ? ", or " : ", ") : null}
                  <Link href={l.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                    {l.label}
                  </Link>
                </span>
              ))}
            , or browse{" "}
            <Link href="/locations" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              all Cape Town cleaning locations
            </Link>
            .
          </p>
        </div>
      </section>

      <section id="faqs" className="scroll-mt-24 border-b border-blue-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Frequently asked questions</h2>
          <p className="mt-3 text-zinc-600">
            Straight answers about booking, scope, and what to expect for this service in Cape Town.
          </p>
          <div className="mt-8 space-y-5">
            {data.faqs.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-zinc-900">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {areaProgrammaticBlogLinks ? (
        <section className="border-b border-blue-100 bg-blue-50/30 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Cleaning Services by Area in Cape Town</h2>
            <ul className="mt-8 flex flex-wrap gap-3">
              {areaProgrammaticBlogLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-50"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <RelatedLinks placement="service" currentServiceSlug={slug} />
        </div>
      </section>

      <section className="bg-blue-600 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Ready to book {data.bookingLabel}?</h2>
        <p className="mx-auto mt-3 max-w-xl text-blue-100">Get an instant price for your Cape Town address, bedrooms, and bathrooms—then choose a time that works.</p>
        <div className="mx-auto mt-6 flex flex-wrap justify-center gap-3">
          <GrowthCtaLink
            href={bookingPath}
            source={`seo_ct_${slug}_footer`}
            className="inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            {slug === "airbnb-cleaning-cape-town" ? "Book Airbnb cleaner" : "Start booking"}
          </GrowthCtaLink>
          {slug === "airbnb-cleaning-cape-town" ? (
            <>
              <GrowthCtaLink
                href={bookingPath}
                source={`seo_ct_${slug}_footer_price`}
                className="inline-flex min-h-12 items-center rounded-xl border border-white/40 bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-500"
              >
                Get instant price
              </GrowthCtaLink>
              <GrowthCtaLink
                href={bookingPath}
                source={`seo_ct_${slug}_footer_avail`}
                className="inline-flex min-h-12 items-center rounded-xl border border-white/40 bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-500"
              >
                Check availability
              </GrowthCtaLink>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
