import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { SeoStage19RegistryRow } from "@/lib/seo/seoPageRegistry";
import {
  buildStage19BookingHref,
  stage19HubRowForSuburb,
  stage19IntentLabel,
  stage19LocationHubHref,
  stage19RelatedLinks,
} from "@/lib/seo/seoPageRegistry";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";

type TrustStats = { reviewCount?: number | null; avgRating?: number | null };

function introParagraph(row: SeoStage19RegistryRow): string {
  const service = stage19IntentLabel(row.intentSegment);
  const place = row.suburbDisplayName;
  const hub = stage19HubRowForSuburb(row.suburbSlug);
  const ctx = hub?.uniqueContextLine?.trim();
  const geo = hub ? `${hub.name} (${hub.region})` : place;
  if (row.intentSegment === "same-day-cleaning") {
    return `Need cleaners fast in ${geo}? Shalean routes same-week and urgent requests when slots allow—transparent quotes online and vetted teams across Cape Town.`;
  }
  if (row.intentSegment === "office-cleaning") {
    return `Reliable commercial cleaning in ${geo}. Tell us your space scope for an upfront quote—ideal for offices and workplaces Shalean can service under current coverage.`;
  }
  if (row.intentSegment === "airbnb-cleaning") {
    return `Turnover-ready ${service.toLowerCase()} in ${geo}. Fresh linens readiness, kitchen reset, and guest-ready finishes—built for hosts who need predictable quality.${ctx ? ` ${ctx}` : ""}`;
  }
  if (row.intentSegment === "move-out-cleaning") {
    return `Bond-focused ${service.toLowerCase()} in ${geo}. Kitchen, bathrooms, and built-ins get priority so handovers feel complete.${ctx ? ` ${ctx}` : ""}`;
  }
  return `Premium ${service.toLowerCase()} in ${geo}. Book online with clear scope and pricing—experienced, vetted cleaners.${ctx ? ` ${ctx}` : ""}`;
}

export function Stage19IntentLanding({ row, trustStats }: { row: SeoStage19RegistryRow; trustStats: TrustStats }) {
  const bookingHref = buildStage19BookingHref(row);
  const hubHref = stage19LocationHubHref(row.suburbSlug);
  const hubRow = stage19HubRowForSuburb(row.suburbSlug);
  const priceHint = hubRow ? getLocationMetaPriceHint(hubRow) : null;
  const { sameSuburb, sameIntent } = stage19RelatedLinks(row);
  const avg =
    typeof trustStats.avgRating === "number" && Number.isFinite(trustStats.avgRating)
      ? trustStats.avgRating.toFixed(1)
      : null;
  const reviews =
    typeof trustStats.reviewCount === "number" && trustStats.reviewCount > 0 ? trustStats.reviewCount : null;

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Cape Town · {stage19IntentLabel(row.intentSegment)}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl">
          {stage19IntentLabel(row.intentSegment)} in {row.suburbDisplayName}
        </h1>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-300">{introParagraph(row)}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <GrowthCtaLink
            href={bookingHref}
            source={`${row.ctaSource}_hero`}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Get instant quote
          </GrowthCtaLink>
          {hubHref && hubHref !== "/locations" ? (
            <Link
              href={hubHref}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              All cleaning services in {row.suburbDisplayName}
            </Link>
          ) : null}
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-700 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pricing snapshot</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {priceHint ?
            <>Typical hub band for {row.suburbDisplayName}: <strong>{priceHint}</strong>. Final totals depend on rooms and extras.</>
          : <>Pricing depends on scope—your quote updates live as you adjust rooms and add-ons.</>}
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Why book with Shalean</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
          {avg && reviews ?
            <li>{avg}★ average from {reviews.toLocaleString()} verified reviews</li>
          : avg ?
            <li>{avg}★ average rating (verified reviews)</li>
          : <li>Vetted cleaners & transparent checkout</li>}
          <li>Secure Paystack payment · no surprise fees on what you select</li>
          <li>Same-week slots when routing allows—shown before you pay</li>
        </ul>
        <div className="mt-4">
          <GrowthCtaLink
            href={bookingHref}
            source={`${row.ctaSource}_mid`}
            className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            Continue to booking →
          </GrowthCtaLink>
        </div>
      </section>

      {(sameSuburb.length > 0 || sameIntent.length > 0) && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Related searches</h2>
          {sameSuburb.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Also in {row.suburbDisplayName}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {sameSuburb.map((r) => (
                  <li key={`${r.intentSegment}-${r.suburbSlug}`}>
                    <Link
                      href={r.canonicalPath}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      {stage19IntentLabel(r.intentSegment)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sameIntent.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {stage19IntentLabel(row.intentSegment)} nearby
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {sameIntent.map((r) => (
                  <li key={`${r.intentSegment}-${r.suburbSlug}`}>
                    <Link
                      href={r.canonicalPath}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      {r.suburbDisplayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
