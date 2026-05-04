import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  ShieldCheck,
  Sparkles,
  UserRoundSearch,
  Wallet,
} from "lucide-react";
import { AboutReviewsRotator } from "@/components/about/AboutReviewsRotator";
import { ReviewCard } from "@/components/about/ReviewCard";
import { StatCard } from "@/components/about/StatCard";
import { StepItem } from "@/components/about/StepItem";
import { TrustItem } from "@/components/about/TrustItem";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import {
  ABOUT_FOUNDING_YEAR,
  ABOUT_REVIEWS,
  ABOUT_WEEKLY_HOMES_CLEANED_DISPLAY,
} from "@/lib/about/about-page-content";
import { GOOGLE_BUSINESS_REVIEWS, googleBusinessAggregateRatingSchema } from "@/lib/seo/googleReviews";
import { FOOTER_POPULAR_LOCATION_HUBS } from "@/lib/seo/locations";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { marketingLandingImage } from "@/lib/marketing/marketingHomeAssets";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";
import { SITE_ORIGIN } from "@/lib/site/canonical";

const TEAM_IMG = marketingLandingImage("/images/marketing/shalean-cleaner-balcony-cape-town.webp");

export function AboutPageView() {
  const suburbCount = CAPE_TOWN_LOCATIONS.length;
  const suburbsDisplay = suburbCount >= 20 ? `${suburbCount}+` : String(suburbCount);

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Shalean Cleaning Services",
    url: SITE_ORIGIN,
    description:
      "Vetted home cleaning teams in Cape Town with transparent pricing, flexible scheduling, and online booking.",
    aggregateRating: googleBusinessAggregateRatingSchema(),
    areaServed: {
      "@type": "City",
      name: "Cape Town",
      containedInPlace: { "@type": "Country", name: "South Africa" },
    },
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About Shalean — Trusted home cleaning in Cape Town",
    url: `${SITE_ORIGIN}/about`,
    isPartOf: { "@type": "WebSite", name: "Shalean", url: SITE_ORIGIN },
    description:
      "Learn why homeowners choose Shalean: vetted cleaners, transparent quotes, and reliable service across Cape Town suburbs.",
    mainEntity: { "@id": `${SITE_ORIGIN}/about#organization` },
  };

  const orgEntityJsonLd = { ...orgJsonLd, "@id": `${SITE_ORIGIN}/about#organization` };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgEntityJsonLd) }} />

      <article>
        {/* 1. Hero */}
        <section className="border-b border-emerald-100 bg-gradient-to-b from-emerald-50/80 via-white to-white">
          <div className="mx-auto max-w-6xl px-4 pt-12 pb-14 sm:px-6 sm:pt-16 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Cape Town · Since {ABOUT_FOUNDING_YEAR}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]">
              Trusted Home Cleaning Services in Cape Town
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
              Thousands of homes cleaned every week by vetted professionals you can rely on.
            </p>
            <ul className="mt-8 flex max-w-xl flex-col gap-3">
              <TrustItem>Background-checked cleaners</TrustItem>
              <TrustItem>Transparent pricing</TrustItem>
              <TrustItem>Same-day bookings available</TrustItem>
            </ul>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <GrowthCtaLink
                href="/booking"
                source="about_hero_book"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Book a cleaner
              </GrowthCtaLink>
              <GrowthCtaLink
                href="/booking/details"
                source="about_hero_price"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-600 bg-white px-8 text-base font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
              >
                Get instant price
              </GrowthCtaLink>
            </div>
          </div>
        </section>

        {/* 2. Proof */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="about-proof-heading">
          <h2 id="about-proof-heading" className="text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Proof you can feel confident about
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-zinc-600 sm:text-base">
            Real operational scale across Cape Town—not vague promises.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              emphasize
              value={ABOUT_WEEKLY_HOMES_CLEANED_DISPLAY}
              label="Homes cleaned weekly"
              hint="Capacity-led scheduling across the metro"
            />
            <StatCard value={`Since ${ABOUT_FOUNDING_YEAR}`} label="Serving Cape Town" hint="Consistent hiring & training focus" />
            <StatCard
              value={`${suburbsDisplay}`}
              label="Suburbs with dedicated hubs"
              hint="Local routing & realistic scopes"
            />
            <StatCard
              value={`★ ${GOOGLE_BUSINESS_REVIEWS.rating}`}
              label={`Google rating (${GOOGLE_BUSINESS_REVIEWS.count}+ reviews)`}
              hint="Public, verified aggregate"
            />
          </div>
        </section>

        {/* 3. How we work */}
        <section className="border-t border-zinc-100 bg-zinc-50/70 py-14" aria-labelledby="about-how-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 id="about-how-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              How we work
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">
              No fluff—just a simple flow from quote to spotless home.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <StepItem
                step="1"
                title="Tell us your needs"
                description="Rooms, bathrooms, access notes, and preferred time window—so your quote matches the visit."
                icon={ClipboardList}
              />
              <StepItem
                step="2"
                title="Get matched with a cleaner"
                description="We dispatch vetted teams with coverage suited to professional home visits—not informal cash-only operators."
                icon={UserRoundSearch}
              />
              <StepItem
                step="3"
                title="Enjoy a spotless home"
                description="Walk into a finished scope with clear redo support if something misses what you confirmed."
                icon={Sparkles}
              />
            </div>
          </div>
        </section>

        {/* 4. Why choose */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="about-why-heading">
          <h2 id="about-why-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Why homeowners choose Shalean
          </h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                Icon: BadgeCheck,
                title: "Vetted & trained cleaners",
                body: "Background checks and onboarding standards—because strangers shouldn’t wander your keys or lift codes.",
              },
              {
                Icon: CalendarClock,
                title: "Flexible scheduling",
                body: "Same-day when routing allows; recurring or once-off—pick what fits your calendar.",
              },
              {
                Icon: Wallet,
                title: "Transparent pricing",
                body: "See itemised totals before you pay—adjust rooms and add-ons until the number matches your scope.",
              },
              {
                Icon: ShieldCheck,
                title: "Reliable service guarantee",
                body: "Structured support if something verifiably misses the agreed checklist—no chasing individuals alone.",
              },
            ].map(({ Icon, title, body }) => (
              <li key={title} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Icon className="size-6" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-bold text-zinc-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 5. Reviews */}
        <section className="border-t border-zinc-100 bg-white py-14" aria-labelledby="about-reviews-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 id="about-reviews-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Real reviews from real suburbs
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">
              Summarised themes from customers—locations called out for trust and context.
            </p>
            <div className="mt-10 lg:hidden">
              <AboutReviewsRotator reviews={ABOUT_REVIEWS} />
            </div>
            <div className="mt-10 hidden gap-6 lg:grid lg:grid-cols-3">
              {ABOUT_REVIEWS.map((r) => (
                <ReviewCard
                  key={`${r.author}-${r.suburb}`}
                  quote={r.quote}
                  author={r.author}
                  initials={r.initials}
                  suburb={r.suburb}
                />
              ))}
            </div>
          </div>
        </section>

        {/* 6. Local authority */}
        <section className="border-t border-zinc-100 bg-zinc-50/80 py-14" aria-labelledby="about-local-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 id="about-local-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Serving homes across Cape Town
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              Browse suburb hubs for parking, property mix, and realistic scopes—then book with the same upfront quote flow everywhere.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {FOOTER_POPULAR_LOCATION_HUBS.map((loc) => (
                <li key={loc.slug}>
                  <Link
                    href={`/locations/${loc.slug}`}
                    className="inline-flex min-h-11 items-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-emerald-300 hover:text-emerald-950"
                  >
                    {loc.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/locations"
                  className={`inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-semibold ${linkEmphasisClassName}`}
                >
                  All locations →
                </Link>
              </li>
            </ul>
          </div>
        </section>

        {/* 7. Team */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="about-team-heading">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <figure className="lg:max-w-lg">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-md lg:aspect-square">
                <Image
                  src={TEAM_IMG}
                  alt="Professional Shalean cleaner in uniform caring for a sunny Cape Town home"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 480px"
                  priority={false}
                />
              </div>
              <figcaption className="mt-3 text-sm leading-relaxed text-zinc-600">
                Professional cleaners delivering consistent results across Cape Town
              </figcaption>
            </figure>
            <div>
              <h2 id="about-team-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
                People behind the polish
              </h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                Apartment lifts, suburban driveways, and move-out deadlines—all scoped upfront so teams arrive prepared.
              </p>
              <GrowthCtaLink
                href="/booking/details"
                source="about_team_price"
                className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Get your price
              </GrowthCtaLink>
            </div>
          </div>
        </section>

        {/* 8. Final CTA */}
        <section className="border-t border-emerald-950 bg-emerald-950 py-16 text-white" aria-labelledby="about-final-heading">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h2 id="about-final-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready for a cleaner home?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-emerald-100/95 sm:text-base">
              Lock scope online—your total is clear before we dispatch.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <GrowthCtaLink
                href="/booking"
                source="about_footer_book"
                className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-white px-8 text-base font-semibold text-emerald-950 transition hover:bg-emerald-50 sm:w-auto"
              >
                Book now
              </GrowthCtaLink>
              <GrowthCtaLink
                href="/booking/details"
                source="about_footer_price"
                className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl border border-emerald-400/90 px-8 text-base font-semibold text-white transition hover:bg-emerald-900/40 sm:w-auto"
              >
                Get your price
              </GrowthCtaLink>
            </div>
          </div>
        </section>
      </article>
    </>
  );
}
