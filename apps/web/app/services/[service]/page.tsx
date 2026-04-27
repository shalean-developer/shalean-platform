import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ShieldCheck, Sparkles, Star } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { LocationBookingWidget } from "@/components/growth/LocationBookingWidget";
import { getLocationsByCity } from "@/lib/locations";
import { getService, SERVICES } from "@/lib/services";

type Props = { params: Promise<{ service: string }> };

const capeTownLocations = getLocationsByCity("cape-town").slice(0, 8);

export function generateStaticParams() {
  return SERVICES.map((service) => ({ service: service.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service: slug } = await params;
  const service = getService(slug);
  if (!service) return { title: "Cleaning Services | Shalean" };

  return {
    title: `${service.h1} | Shalean Cleaning Services`,
    description: service.description,
    alternates: {
      canonical: `/services/${service.slug}`,
    },
    openGraph: {
      title: `${service.h1} | Shalean Cleaning Services`,
      description: service.description,
      url: `/services/${service.slug}`,
      type: "website",
    },
  };
}

export default async function ServicePage({ params }: Props) {
  const { service: slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  const relatedServices = SERVICES.filter((item) => item.slug !== service.slug).slice(0, 4);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        name: "Shalean Cleaning Services",
        url: "https://www.shalean.co.za",
        areaServed: "Cape Town",
        serviceType: SERVICES.map((item) => item.name),
        aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", reviewCount: "500" },
      },
      {
        "@type": "Service",
        name: service.name,
        serviceType: service.name,
        areaServed: "Cape Town",
        provider: {
          "@type": "LocalBusiness",
          name: "Shalean Cleaning Services",
        },
        url: `https://www.shalean.co.za/services/${service.slug}`,
        description: service.description,
        review: service.reviews.map((review) => ({
          "@type": "Review",
          author: { "@type": "Person", name: review.author },
          reviewRating: { "@type": "Rating", ratingValue: String(review.rating), bestRating: "5" },
          reviewBody: review.body,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: service.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.a,
          },
        })),
      },
    ],
  };

  return (
    <main className="bg-white text-zinc-900">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_service", service: service.slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <section className="border-b border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white py-14">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1fr_420px] lg:items-start">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean Cleaning Services</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">
              {service.h1}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-zinc-600">{service.description}</p>
            <p className="mt-4 rounded-2xl border border-blue-100 bg-white p-4 text-sm font-semibold leading-relaxed text-blue-800 shadow-sm">
              {service.urgencyCopy}
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-zinc-700">
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-blue-100">Vetted cleaners</span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-blue-100">Instant quote</span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-blue-100">Same-day slots available</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <GrowthCtaLink href="/booking?step=entry" source={`seo_service_${service.slug}_hero`} className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700">
                Book {service.name}
              </GrowthCtaLink>
              <Link href="#included" className="inline-flex min-h-12 items-center rounded-xl border border-blue-200 px-6 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50">
                See what is included
              </Link>
            </div>
          </div>
          <LocationBookingWidget />
        </div>
      </section>

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1fr_380px] lg:items-start">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900">{service.name} Services in Cape Town</h2>
            <div className="mt-4 space-y-4 text-base leading-7 text-zinc-600">
              <p>{service.intro}</p>
              <p>
                Book your clean online in minutes, choose your home size and extras, and get transparent pricing before checkout.
                Shalean is built for Cape Town homes, apartments, rentals, and short-stay properties that need dependable cleaning.
              </p>
              <p>
                For high-intent searches like {service.name.toLowerCase()} Cape Town, professional {service.name.toLowerCase()} for homes,
                and affordable {service.name.toLowerCase()} prices, this page gives customers a clear route from research to booking.
              </p>
              <p className="font-semibold text-zinc-800">{service.comparisonCopy}</p>
            </div>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 shadow-sm">
            {service.imageSrc ? (
              <Image
                src={service.imageSrc}
                alt={service.imageAlt}
                width={760}
                height={560}
                className="aspect-[4/3] h-auto w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-blue-100 via-white to-blue-50 px-6 text-center text-sm font-semibold text-blue-800">
                {service.imageAlt}
              </div>
            )}
            <figcaption className="border-t border-blue-100 bg-white px-4 py-3 text-sm text-zinc-600">
              Add a real optimized photo at <code className="text-xs">/public/images/services/{service.slug}.jpg</code>.
            </figcaption>
          </figure>
        </div>
      </section>

      {service.contentSections.map((section, index) => (
        <section key={section.heading} className={`border-b border-blue-100 py-16 ${index % 2 === 0 ? "bg-white" : "bg-blue-50/40"}`}>
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900">{section.heading}</h2>
            <div className="mt-5 space-y-4 text-base leading-7 text-zinc-600">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section id="included" className="scroll-mt-28 border-b border-blue-100 bg-white py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900">What is Included in {service.name}?</h2>
            <p className="mt-3 text-zinc-600">
              Every clean follows a practical checklist, with room count and extras selected during booking.
            </p>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {service.includes.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-5 text-sm font-medium text-zinc-700">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/40 py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 md:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <Sparkles className="h-6 w-6 text-blue-600" aria-hidden />
            <h2 className="mt-4 text-xl font-bold tracking-tight">Professional {service.name} for Homes</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">{service.whoFor}</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <ShieldCheck className="h-6 w-6 text-blue-600" aria-hidden />
            <h2 className="mt-4 text-xl font-bold tracking-tight">Trusted, Vetted Cleaners</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              Shalean works with verified cleaners, supports secure online booking, and tracks customer feedback after jobs.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <Star className="h-6 w-6 text-blue-600" aria-hidden />
            <h2 className="mt-4 text-xl font-bold tracking-tight">Affordable {service.name} Prices</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">{service.pricingCopy}</p>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">{service.name} Across Cape Town</h2>
          <p className="mt-3 max-w-3xl text-zinc-600">
            Shalean connects service pages with local SEO pages so customers can find the right clean in the right area.
          </p>
          <ul className="mt-8 flex flex-wrap gap-3">
            {capeTownLocations.map((location) => (
              <li key={location.slug}>
                <Link href={`/cleaning-services/${location.slug}`} className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-blue-300 hover:text-blue-700">
                  {service.name} in {location.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-white py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Explore More Cleaning Services</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedServices.map((item) => (
              <Link key={item.slug} href={`/services/${item.slug}`} className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 transition hover:border-blue-300 hover:bg-blue-50">
                <h3 className="font-semibold text-zinc-900">{item.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/40 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Customer Reviews for {service.name}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {service.reviews.map((review) => (
              <blockquote key={review.author} className="rounded-2xl border border-blue-100 bg-white p-5 text-sm text-zinc-600 shadow-sm">
                <p className="mb-3 text-xs font-semibold text-blue-600">{review.rating}.0 rating</p>
                <span>&ldquo;{review.body}&rdquo;</span>
                <footer className="mt-3 font-semibold text-zinc-900">- {review.author}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">FAQs About {service.name} in Cape Town</h2>
          <div className="mt-8 space-y-5">
            {service.faqs.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-zinc-900">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blue-600 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Book {service.name} in Minutes</h2>
        <p className="mx-auto mt-3 max-w-2xl text-blue-50">
          Same-day slots may be available. Get your instant price and choose a time that works for your home.
        </p>
        <GrowthCtaLink href="/booking?step=entry" source={`seo_service_${service.slug}_final_cta`} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-blue-600 transition hover:bg-blue-50">
          Get your price
        </GrowthCtaLink>
      </section>
    </main>
  );
}
