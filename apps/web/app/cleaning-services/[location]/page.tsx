import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { LocationBookingWidget } from "@/components/growth/LocationBookingWidget";
import { getLocation, getLocationsByCity } from "@/lib/locations";

type Props = { params: Promise<{ location: string }> };

const services = ["Standard cleaning", "Deep cleaning", "Airbnb cleaning", "Move-in / move-out cleaning", "Carpet cleaning"];

const serviceDetails = [
  {
    title: "Standard Home Cleaning",
    href: "/services/standard-cleaning-cape-town",
    body: "Recurring maintenance cleaning for kitchens, bathrooms, floors, bedrooms, and high-touch surfaces.",
  },
  {
    title: "Deep Cleaning Services",
    href: "/services/deep-cleaning-cape-town",
    body: "A more detailed reset for built-up dust, grout, fixtures, cupboards, and areas that need extra time.",
  },
  {
    title: "Airbnb Cleaning",
    href: "/services/airbnb-cleaning-cape-town",
    body: "Guest-ready turnover cleaning for short-stay properties, including bathrooms, kitchens, beds, and presentation details.",
  },
  {
    title: "Move Out Cleaning",
    href: "/services/move-out-cleaning-cape-town",
    body: "Handover-ready cleaning for tenants, landlords, and families preparing a property before or after a move.",
  },
  {
    title: "Carpet Cleaning",
    href: "/services/carpet-cleaning-cape-town",
    body: "Refresh high-traffic rugs and carpets as part of a wider cleaning plan for your home.",
  },
] as const;

const faq = [
  {
    q: "How quickly can I book cleaning?",
    a: "Most customers complete booking in under 60 seconds. Available slots depend on cleaner supply in your area.",
  },
  {
    q: "Are cleaners vetted?",
    a: "Yes. Shalean works with verified cleaners and tracks customer ratings after every job.",
  },
  {
    q: "Do you offer Airbnb cleaning?",
    a: "Yes. Airbnb turnover cleaning is available with checklist speed, guest-ready bathrooms, and photo-friendly finishes.",
  },
] as const;

export function generateStaticParams() {
  return getLocationsByCity("cape-town").map((loc) => ({ location: loc.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { location } = await params;
  const loc = getLocation(location);
  if (!loc || loc.citySlug !== "cape-town") return { title: "Cleaning Services | Shalean" };
  return {
    title: `Home Cleaning Services in ${loc.name} | Shalean`,
    description: `Book professional home cleaning services in ${loc.name}. Trusted cleaners, instant pricing, and easy booking.`,
    alternates: {
      canonical: `/cleaning-services/${loc.slug}`,
    },
    robots: { index: false, follow: true },
  };
}

export default async function LocationCleaningPage({ params }: Props) {
  const { location } = await params;
  const loc = getLocation(location);
  if (!loc || loc.citySlug !== "cape-town") notFound();
  const nearby = loc.nearby
    .map((slug) => getLocation(slug))
    .filter((item): item is NonNullable<typeof item> => item !== null && item.citySlug === "cape-town");
  const locationReviews = [
    loc.review,
    {
      author: "James K",
      body: `Very reliable and professional cleaners in ${loc.name}. The booking flow was simple and the price was clear.`,
    },
    {
      author: "Thandi M",
      body: `I booked deep cleaning services in ${loc.name} and the kitchen, bathrooms, and floors looked excellent.`,
    },
  ];
  const locationFaq = [
    ...faq,
    {
      q: `What does cleaning in ${loc.name} cost?`,
      a: `Pricing for cleaning in ${loc.name} depends on your home size, service type, extras, and time slot. Your exact quote appears before checkout.`,
    },
    {
      q: `Can I book same-day cleaning in ${loc.name}?`,
      a: `Same-day cleaning in ${loc.name} depends on cleaner availability. Start a booking to see the soonest open slots.`,
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Shalean Cleaning Services",
    areaServed: loc.name,
    url: `https://www.shalean.co.za/cleaning-services/${loc.slug}`,
    description: `Professional home cleaning services in ${loc.name}.`,
    serviceType: services,
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: locationFaq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <main className="bg-white text-zinc-900">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_location", location: loc.slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <section className="border-b border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white py-14">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1fr_420px] lg:items-start">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean Cleaning Services</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">
              Home Cleaning Services in {loc.name}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-zinc-600">
              Book trusted cleaning services in {loc.name}. Shalean offers standard, deep, Airbnb, move-out, and
              carpet cleaning with instant pricing and secure online checkout.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-zinc-700">
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-blue-100">Vetted cleaners</span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-blue-100">4.9★ average rating</span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-blue-100">Instant quote</span>
            </div>
            <div className="mt-8">
              <GrowthCtaLink href="/booking?step=entry" source="seo_location_hero" className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700">
                Book cleaning in {loc.name}
              </GrowthCtaLink>
            </div>
          </div>
          <LocationBookingWidget />
        </div>
      </section>

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Professional Cleaning Services in {loc.name}</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-zinc-600">
                <p>
                  Shalean Cleaning Services provides trusted home cleaning in {loc.name}, including {loc.propertyFocus}.
                  Our vetted cleaners handle everything from regular maintenance cleaning to deep cleaning, Airbnb cleaning,
                  and move-out services.
                </p>
                <p>
                  Whether you live in a modern apartment in {loc.name}, a family home, or a rental property that needs a
                  reliable turnover, we tailor the clean to your rooms, extras, schedule, and budget. {loc.localContext}
                </p>
                <p>
                  Every booking starts with a transparent quote. You choose the service, bedrooms, bathrooms, extras, and
                  preferred time before checkout, so there are no surprise fees at the door. This helps homeowners, tenants,
                  and Airbnb hosts in {loc.name} plan their cleaning with confidence.
                </p>
              </div>
            </div>
            <figure className="overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 shadow-sm">
              {loc.imageSrc ? (
                <Image
                  src={loc.imageSrc}
                  alt={loc.imageAlt}
                  width={760}
                  height={560}
                  className="aspect-[4/3] h-auto w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-blue-100 via-white to-blue-50 px-6 text-center text-sm font-semibold text-blue-800">
                  {loc.imageAlt}
                </div>
              )}
              <figcaption className="border-t border-blue-100 bg-white px-4 py-3 text-sm text-zinc-600">
                Add a real optimized photo at <code className="text-xs">/public/images/locations/{loc.slug}-cleaning.jpg</code>.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-white py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Our Cleaning Services in {loc.name}</h2>
          <p className="mt-3 max-w-3xl text-zinc-600">
            Use Shalean for standard home cleaning, deep cleaning services in {loc.name}, Airbnb cleaning in {loc.name},
            move-out cleaning in {loc.name}, and carpet cleaning for busy homes and rentals.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {serviceDetails.map((service) => (
              <li key={service.title} className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                <h2 className="text-sm font-semibold text-zinc-900">
                  <Link href={service.href} className="transition hover:text-blue-700">
                    {service.title} in {loc.name}
                  </Link>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{service.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/40 py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 md:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold tracking-tight">Why choose Shalean?</h2>
            <ul className="mt-4 space-y-2 text-sm text-zinc-600">
              <li>Fast booking and clear pricing</li>
              <li>Reliable, vetted cleaners</li>
              <li>Support for homes, apartments, and Airbnb hosts</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold tracking-tight">Pricing preview</h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              Cleaning in {loc.name} starts from a live quote based on home size, service type, extras, and time slot.
              Your exact price is shown before payment.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold tracking-tight">Easy online booking</h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              Pick your service, rooms, extras, and preferred time. Shalean confirms the details and dispatches a
              trusted cleaner to your {loc.name} address.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Nearby cleaning service areas</h2>
          <ul className="mt-8 flex flex-wrap gap-3">
            {nearby.map((item) => (
              <li key={item.slug}>
                <Link href={`/cleaning-services/${item.slug}`} className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-blue-300 hover:text-blue-700">
                  Cleaning services in {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/40 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Reviews from local customers</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {locationReviews.map((review) => (
              <blockquote key={review.author} className="rounded-2xl border border-blue-100 bg-white p-5 text-sm text-zinc-600 shadow-sm">
                “{review.body}”
                <footer className="mt-3 font-semibold text-zinc-900">— {review.author}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">FAQs about Cleaning in {loc.name}</h2>
          <div className="mt-8 space-y-5">
            {locationFaq.map((item) => (
              <div key={item.q} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-zinc-900">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blue-600 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Ready to book cleaning in {loc.name}?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-blue-50">Get an instant price and choose a slot that works for your home.</p>
        <GrowthCtaLink href="/booking?step=entry" source="seo_location_final_cta" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-blue-600 transition hover:bg-blue-50">
          Get your price
        </GrowthCtaLink>
      </section>
    </main>
  );
}
