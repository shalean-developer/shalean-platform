import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, MapPin, Sparkles } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { getAreaProgrammaticBlogLinksForCapeTownService } from "@/lib/blog/programmaticPosts";
import { publicTrustRatingBadgeLine } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import type { CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import { CAPE_TOWN_SERVICE_SEO, serviceHubLocationLinks } from "@/lib/seo/capeTownSeoPages";

type Props = { slug: CapeTownSeoServiceSlug; trustStats: PublicReviewBannerStats | null };

export function SeoCapeTownServicePage({ slug, trustStats }: Props) {
  const data = CAPE_TOWN_SERVICE_SEO[slug];
  const bookingPath = data.bookingPath ?? "/booking?step=entry";
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
          Book {data.bookingLabel}
        </GrowthCtaLink>
        <Link
          href="#included"
          className="inline-flex min-h-12 items-center rounded-xl border border-blue-200 px-6 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          What&apos;s included
        </Link>
      </div>
    </>
  );

  const pageUrl = `https://www.shalean.co.za${data.path}`;
  const faqPageEntity = {
    "@type": "FAQPage",
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: data.h1,
        description: data.description,
        areaServed: { "@type": "City", name: "Cape Town" },
        provider: { "@id": "https://www.shalean.co.za/#localbusiness" },
        url: pageUrl,
      },
      faqPageEntity,
    ],
  };

  return (
    <main className="bg-white text-zinc-900">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_cape_town_service", slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

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

      <section className="bg-blue-600 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Ready to book {data.bookingLabel}?</h2>
        <p className="mx-auto mt-3 max-w-xl text-blue-100">Get an instant price for your Cape Town address, bedrooms, and bathrooms—then choose a time that works.</p>
        <GrowthCtaLink
          href={bookingPath}
          source={`seo_ct_${slug}_footer`}
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-blue-700 transition hover:bg-blue-50"
        >
          Start booking
        </GrowthCtaLink>
      </section>
    </main>
  );
}
