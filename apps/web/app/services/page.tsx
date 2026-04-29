import type { Metadata } from "next";
import Link from "next/link";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import {
  CAPE_TOWN_SERVICE_SEO,
  LOCATION_SEO_PAGES,
  LOCATION_SEO_SHORT_PLACE,
} from "@/lib/seo/capeTownSeoPages";
import type { CapeTownSeoServiceSlug, LocationSeoSlug } from "@/lib/seo/capeTownSeoPages";

const SITE = "https://www.shalean.co.za";
const CANONICAL = "/services";
const PAGE_URL = `${SITE}${CANONICAL}`;

const p = CAPE_TOWN_SERVICE_SEO;

/** Order matches on-page “types” section + ItemList for schema. */
const HUB_SERVICE_SLUGS: CapeTownSeoServiceSlug[] = [
  "standard-cleaning-cape-town",
  "deep-cleaning-cape-town",
  "airbnb-cleaning-cape-town",
  "move-out-cleaning-cape-town",
  "carpet-cleaning-cape-town",
  "office-cleaning-cape-town",
];

const HUB_AREA_SLUGS: LocationSeoSlug[] = [
  "claremont-cleaning-services",
  "wynberg-cleaning-services",
  "rondebosch-cleaning-services",
];

const linkClass = "font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-2 transition hover:text-blue-700 hover:decoration-blue-700";

const popularCleaningLinks: { href: string; label: string }[] = [
  { href: "/booking?step=entry", label: "Same day cleaning Cape Town" },
  { href: p["standard-cleaning-cape-town"].path, label: "House cleaning Cape Town" },
  { href: p["standard-cleaning-cape-town"].path, label: "Apartment cleaning Cape Town" },
  { href: p["standard-cleaning-cape-town"].path, label: "Weekly cleaning services Cape Town" },
  { href: p["standard-cleaning-cape-town"].path, label: "Once-off cleaning Cape Town" },
  { href: p["move-out-cleaning-cape-town"].path, label: "Move-out cleaning Cape Town" },
  { href: p["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning service Cape Town" },
  { href: p["standard-cleaning-cape-town"].path, label: "Home cleaning services Cape Town" },
];

const title = "Cleaning Services Cape Town | Home, Deep & Airbnb | Shalean";
const description =
  "Professional cleaning services in Cape Town for homes, apartments, and rentals—standard, deep, Airbnb, move-out, carpet, and office. Book online with Shalean.";

const hubPageJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${PAGE_URL}#webpage`,
      url: PAGE_URL,
      name: "Cleaning Services in Cape Town",
      description,
      isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: SITE },
      breadcrumb: { "@id": `${PAGE_URL}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${PAGE_URL}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Cleaning services",
          item: PAGE_URL,
        },
      ],
    },
    {
      "@type": "ItemList",
      "@id": `${PAGE_URL}#services-itemlist`,
      name: "Cleaning services offered in Cape Town",
      description: "Main Shalean cleaning service guides for Cape Town customers.",
      numberOfItems: HUB_SERVICE_SLUGS.length,
      itemListElement: HUB_SERVICE_SLUGS.map((slug, i) => {
        const block = p[slug];
        return {
          "@type": "ListItem",
          position: i + 1,
          name: block.h1,
          item: `${SITE}${block.path}`,
        };
      }),
    },
  ],
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title,
    description,
    images: [{ url: "/images/marketing/house-deep-cleaning-cape-town.webp", alt: "Cleaning services in Cape Town" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/images/marketing/house-deep-cleaning-cape-town.webp"],
  },
};

export default function ServicesHubPage() {
  const jsonLdStr = JSON.stringify(hubPageJsonLd).replace(/</g, "\\u003c");

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

        <h1 className="text-3xl font-bold tracking-tight text-slate-900 lg:text-4xl">Cleaning Services in Cape Town</h1>

        <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-600 lg:text-lg">
          <p>
            Shalean offers professional cleaning services in Cape Town for houses, apartments, and short-stay rentals.
            Whether you need a dependable reset between busy weeks, a detailed refresh before guests arrive, or a
            handover-ready finish at the end of a lease, you can compare scope online and lock pricing before anyone is
            dispatched. Customers across the Southern Suburbs and wider metro use us for flexible booking, clear
            totals, and cleaners who arrive briefed for the job you actually booked. When you are ready, you can{" "}
            <Link href="/booking?step=entry" className={linkClass}>
              check pricing and availability instantly
            </Link>{" "}
            in our online booking system—adjust rooms and extras until the total matches what you need, then confirm
            only if it works for you.
          </p>
          <p>
            If you are deciding where to start,{" "}
            <Link href={p["standard-cleaning-cape-town"].path} className={linkClass}>
              standard cleaning services in Cape Town
            </Link>{" "}
            keep kitchens, bathrooms, and floors on a steady rhythm—ideal for families and professionals who want a
            livable baseline without micromanaging every visit. When grease, grout, and built-up dust need more time,{" "}
            <Link href={p["deep-cleaning-cape-town"].path} className={linkClass}>
              deep cleaning services in Cape Town
            </Link>{" "}
            focus on detail zones that change how a home feels day to day. Hosts juggling calendars often pair turnover
            work with{" "}
            <Link href={p["airbnb-cleaning-cape-town"].path} className={linkClass}>
              Airbnb cleaning in Cape Town
            </Link>{" "}
            so living spaces, bathrooms, and high-touch surfaces read guest-ready before the next check-in.
          </p>
          <p>
            Moving days are simpler when{" "}
            <Link href={p["move-out-cleaning-cape-town"].path} className={linkClass}>
              move-out cleaning in Cape Town
            </Link>{" "}
            is scoped against what agencies and landlords typically inspect first. Need something sooner? Start a
            booking to see the soonest open slots—many customers searching for{" "}
            <Link href="/booking?step=entry" className={linkClass}>
              same day cleaning in Cape Town
            </Link>{" "}
            begin there, then adjust bedrooms, bathrooms, and extras so the quote matches the visit.
          </p>
          <p>
            For broader searches—
            <Link href={p["standard-cleaning-cape-town"].path} className={linkClass}>
              house cleaning services in Cape Town
            </Link>
            ,{" "}
            <Link href={p["standard-cleaning-cape-town"].path} className={linkClass}>
              home cleaning in Cape Town
            </Link>
            , or teams of{" "}
            <Link href={p["standard-cleaning-cape-town"].path} className={linkClass}>
              professional cleaners in Cape Town
            </Link>
            —the same booking flow applies: set your address and room count, then choose the tier that matches how your
            space is used week to week.
          </p>
        </div>

        <section className="mt-14 border-t border-slate-200 pt-12" aria-labelledby="hub-which-heading">
          <h2 id="hub-which-heading" className="text-xl font-bold tracking-tight text-slate-900">
            Which cleaning service do you need?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            Use this quick guide to match intent to the right guide—each link opens the full scope for that service
            type.
          </p>
          <ul className="mt-6 space-y-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            <li>
              <strong className="text-slate-900">Standard cleaning</strong> — regular upkeep when you want floors,
              kitchens, and bathrooms kept on a predictable rhythm.{" "}
              <Link href={p["standard-cleaning-cape-town"].path} className={linkClass}>
                Standard cleaning in Cape Town
              </Link>
            </li>
            <li>
              <strong className="text-slate-900">Deep cleaning</strong> — a detailed refresh when build-up, guests, or
              a new season calls for extra time on fixtures, edges, and high-use rooms.{" "}
              <Link href={p["deep-cleaning-cape-town"].path} className={linkClass}>
                Deep cleaning in Cape Town
              </Link>
            </li>
            <li>
              <strong className="text-slate-900">Airbnb cleaning</strong> — turnover-focused visits between check-out
              and check-in so short-stay listings stay photo-ready.{" "}
              <Link href={p["airbnb-cleaning-cape-town"].path} className={linkClass}>
                Airbnb turnover cleaning
              </Link>
            </li>
            <li>
              <strong className="text-slate-900">Move-out cleaning</strong> — handover-oriented scope aligned with what
              landlords and agencies usually inspect at lease end.{" "}
              <Link href={p["move-out-cleaning-cape-town"].path} className={linkClass}>
                Move-out cleaning in Cape Town
              </Link>
            </li>
          </ul>
        </section>

        <section className="mt-14 border-t border-slate-200 pt-12" aria-labelledby="hub-types-heading">
          <h2 id="hub-types-heading" className="text-xl font-bold tracking-tight text-slate-900">
            Types of cleaning we offer in Cape Town
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Each guide explains what is included, who it suits, and how to book for your address.
          </p>

          <div className="mt-8 space-y-10">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Home cleaning in Cape Town</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                Recurring and once-off visits for busy households—surfaces, floors, kitchens, and bathrooms on a
                checklist that matches your room count.{" "}
                <Link href={p["standard-cleaning-cape-town"].path} className={linkClass}>
                  Explore standard home cleaning in Cape Town
                </Link>
                .
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Deep cleaning in Cape Town</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                For post-build dust, seasonal resets, or homes that need more than a light tidy—extra attention on
                fixtures, edges, and high-use rooms.{" "}
                <Link href={p["deep-cleaning-cape-town"].path} className={linkClass}>
                  Read the deep cleaning guide
                </Link>
                .
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Airbnb cleaning in Cape Town</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                Turnover-focused resets between guests: kitchens, bathrooms, floors, and presentation details that show
                up in photos and reviews.{" "}
                <Link href={p["airbnb-cleaning-cape-town"].path} className={linkClass}>
                  See Airbnb turnover cleaning
                </Link>
                .
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Move-out cleaning in Cape Town</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                Structured handover cleaning for tenants, landlords, and families coordinating keys, movers, and
                inspections on tight timelines.{" "}
                <Link href={p["move-out-cleaning-cape-town"].path} className={linkClass}>
                  View move-out cleaning scope
                </Link>
                .
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Carpet and office cleaning in Cape Town</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                Refresh high-traffic rugs and carpets on their own or alongside a wider home visit, and keep small
                workspaces presentable with scoped office visits.{" "}
                <Link href={p["carpet-cleaning-cape-town"].path} className={linkClass}>
                  Carpet cleaning in Cape Town
                </Link>
                {" · "}
                <Link href={p["office-cleaning-cape-town"].path} className={linkClass}>
                  Office cleaning in Cape Town
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="mt-14 border-t border-slate-200 pt-12" aria-labelledby="hub-areas-heading">
          <h2 id="hub-areas-heading" className="text-xl font-bold tracking-tight text-slate-900">
            Areas we serve
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            We provide cleaning services across Cape Town, including Claremont, Wynberg, and Rondebosch—alongside the
            wider metro routes our teams already run.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            Suburb pages explain local access, typical homes, and how{" "}
            <Link href={p["deep-cleaning-cape-town"].path} className={linkClass}>
              deep cleaning services in Cape Town
            </Link>{" "}
            or other tiers map to your street—then link back to these Cape Town-wide guides for full checklists.
          </p>
          <ul className="mt-6 space-y-3">
            {HUB_AREA_SLUGS.map((slug) => {
              const block = LOCATION_SEO_PAGES[slug];
              const place = LOCATION_SEO_SHORT_PLACE[slug];
              return (
                <li key={block.path}>
                  <Link
                    href={block.path}
                    className="font-medium text-blue-600 transition hover:text-blue-700 hover:underline"
                  >
                    Cleaning services in {place}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-14 border-t border-slate-200 pt-12" aria-labelledby="hub-popular-heading">
          <h2 id="hub-popular-heading" className="text-xl font-bold tracking-tight text-slate-900">
            Popular cleaning services in Cape Town
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Keyword-focused entry points—each opens a service guide or the booking flow so you can compare scope
            before checkout.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            <strong className="text-slate-900">Same-day cleaning in Cape Town</strong> is available when cleaner
            capacity, your suburb, and the size of the job line up—slots change throughout the day, so the fastest path
            is to start a booking and pick the earliest time that still fits your bedrooms, bathrooms, and extras.
          </p>
          <ul className="mt-6 space-y-3">
            {popularCleaningLinks.map((item) => (
              <li key={`${item.href}-${item.label}`}>
                <Link
                  href={item.href}
                  className="font-medium text-blue-600 transition hover:text-blue-700 hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14 border-t border-slate-200 pt-12" aria-labelledby="hub-trust-heading">
          <h2 id="hub-trust-heading" className="text-xl font-bold tracking-tight text-slate-900">
            Why choose Shalean for cleaning services in Cape Town
          </h2>
          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600 sm:text-base">
            <li>Vetted cleaners with structured checklists for each service tier.</li>
            <li>Transparent pricing—you see how rooms, bathrooms, and extras affect your total before you pay.</li>
            <li>Flexible booking that fits work-from-home days, school runs, and turnover windows.</li>
            <li>Coverage across Cape Town with suburb hubs for Southern Suburbs addresses.</li>
          </ul>
        </section>
      </article>
    </MarketingLayout>
  );
}
