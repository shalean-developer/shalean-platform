import Link from "next/link";
import { Sparkles } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { publicTrustRatingBadgeLine } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import type { LocationSeoBlock } from "@/lib/seo/capeTownSeoPages";
import { defaultLocationFaqs, nearbyProgrammaticLocations } from "@/lib/seo/locations";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  location: CapeTownLocationRow;
  seo: LocationSeoBlock | null;
  trustStats: PublicReviewBannerStats | null;
};

const STANDARD_SERVICE = "/services/standard-cleaning-cape-town";
const DEEP_SERVICE = "/services/deep-cleaning-cape-town";

function formatNearbyNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function locationIntroParagraphs(loc: CapeTownLocationRow): string[] {
  const { name, city, region } = loc;
  const trust =
    "Shalean connects you with vetted, insured cleaners and shows a clear total before you confirm—no surprise surcharges for the scope you select.";
  const isAtlantic = region.toLowerCase().includes("atlantic");
  const isCityBowl = region.toLowerCase().includes("city bowl");
  if (isAtlantic) {
    return [
      `${name} sits on Cape Town’s ${region}: apartments, sea air, and tight schedules. ${trust}`,
      `Book for your ${name} address in ${city}—we factor building access, lifts, and the service tier you choose so teams arrive prepared.`,
    ];
  }
  if (isCityBowl) {
    return [
      `${name} is part of ${city}’s ${region}: compact flats, walkable streets, and busy weeks where kitchens and bathrooms need dependable resets. ${trust}`,
      `Tell us your ${name} building access and room count at checkout—quotes stay accurate for ${city} denser layouts and mixed-use blocks.`,
    ];
  }
  return [
    `${name} is a ${region} neighbourhood in ${city}: family homes, rentals, and busy weeknights that add up between professional visits. ${trust}`,
    `Whether you need upkeep or a deeper reset, enter your ${name} street and room count at checkout so ${city} pricing stays accurate for your home.`,
  ];
}

export function ProgrammaticLocationCleaningPage({ location, seo, trustStats }: Props) {
  const slug = location.slug;
  const h1 = seo?.h1 ?? `Cleaning Services in ${location.name}`;
  const intro = seo?.intro?.length ? seo.intro : locationIntroParagraphs(location);
  const nearby = nearbyProgrammaticLocations(slug, 6);
  const nearbyNamesForCopy = nearby.map((l) => l.name);
  const nearbyListSentence = formatNearbyNames(nearbyNamesForCopy);
  const faqs = seo?.faqs?.length ? seo.faqs : defaultLocationFaqs(location.name, location.city);
  const eyebrow = `${location.city} · ${location.region}`;
  const bookCtaLabel = `Book a cleaner in ${location.name}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: h1,
        description: seo?.description ?? `Trusted cleaning in ${location.name}, ${location.city}.`,
        url: `https://www.shalean.co.za/locations/${slug}`,
        isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: "https://www.shalean.co.za" },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <main className="bg-white text-zinc-900">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_location", slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="border-b border-emerald-100 bg-gradient-to-b from-emerald-50/60 via-white to-white py-14">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">{h1}</h1>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-zinc-600">
            {intro.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-5 border-l-4 border-emerald-200 pl-4 text-base font-medium leading-relaxed text-zinc-800">
            {location.uniqueContextLine}
          </p>
          <p className="mt-5 text-base leading-relaxed text-zinc-700">
            We help families, professionals, and Airbnb hosts in {location.name}, {location.city}, with vetted cleaners
            and transparent online quoting—tell us your address and room count so your total is clear before you
            confirm.
          </p>
          <p className="mt-4 text-sm font-medium text-zinc-700">
            {publicTrustRatingBadgeLine(trustStats)} · Thousands of Cape Town cleans completed through Shalean
          </p>
          <GrowthCtaLink
            href="/booking/details"
            source={`seo_loc_${slug}_hero`}
            className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {bookCtaLabel}
          </GrowthCtaLink>
        </div>
      </section>

      {seo?.localAngle?.length ? (
        <section className="border-b border-zinc-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Local context</h2>
            <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
              {seo.localAngle.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {seo?.whyChoose?.length ? (
        <section className="border-b border-zinc-100 bg-zinc-50/50 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Why Cape Town customers choose Shalean</h2>
            <ul className="mt-8 space-y-4">
              {seo.whyChoose.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-700 shadow-sm"
                >
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Popular services for {location.name}</h2>
          <p className="mt-3 text-base text-zinc-600">
            Start with a Cape Town-wide guide, then enter your {location.name} details at checkout for an accurate quote.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            <li>
              <Link
                href={STANDARD_SERVICE}
                className="block rounded-2xl border border-emerald-100 bg-white p-5 text-base font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                Home cleaning in {location.name}
              </Link>
            </li>
            <li>
              <Link
                href={DEEP_SERVICE}
                className="block rounded-2xl border border-emerald-100 bg-white p-5 text-base font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                Deep cleaning services in {location.name}
              </Link>
            </li>
          </ul>
          <p className="mt-6 text-sm text-zinc-600">
            More guides:{" "}
            <Link href="/services" className={linkEmphasisClassName}>
              all Cape Town cleaning services
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border-b border-zinc-100 bg-zinc-50/50 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Cleaning services near {location.name}</h2>
          {nearbyListSentence ? (
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              We also provide cleaning services in nearby areas such as {nearbyListSentence}. Each hub explains local
              access and links to the same Cape Town-wide service guides you can book for your street.
            </p>
          ) : (
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              Explore other {location.city} suburb hubs—each page is tailored to {location.region} demand and links to
              booking with transparent quoting.
            </p>
          )}
          <ul className="mt-6 flex flex-wrap gap-2">
            {nearby.map((loc) => (
              <li key={loc.slug}>
                <Link
                  href={`/locations/${loc.slug}`}
                  className="inline-flex max-w-full rounded-full border border-zinc-200 bg-white px-4 py-2 text-left text-sm font-medium leading-snug text-zinc-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-900"
                >
                  Cleaning services in {loc.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">FAQs — {location.name}</h2>
          <dl className="mt-8 space-y-6">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <dt className="text-base font-semibold text-zinc-900">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <RelatedLinks placement="location" currentLocationSlug={slug} />
        </div>
      </section>

      <section className="bg-zinc-900 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Book cleaning in {location.name}</h2>
        <p className="mx-auto mt-3 max-w-lg text-zinc-300">
          {location.city}-wide coverage with suburb-aware quoting—confirm your total before you pay.
        </p>
        <GrowthCtaLink
          href="/booking/details"
          source={`seo_loc_${slug}_footer`}
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-zinc-900 transition hover:bg-zinc-100"
        >
          {bookCtaLabel}
        </GrowthCtaLink>
      </section>
    </main>
  );
}
