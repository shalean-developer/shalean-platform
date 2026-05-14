import Link from "next/link";
import { CAPE_TOWN_LOCATIONS_OVERVIEW_PATH } from "@/lib/seo/capeTownLocations";
import { CAPE_TOWN_SERVICE_SEO, type CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";

const CORE_SERVICE_SLUGS = [
  "standard-cleaning-cape-town",
  "deep-cleaning-cape-town",
  "move-out-cleaning-cape-town",
] as const satisfies readonly CapeTownSeoServiceSlug[];

const CORE_LABELS: Record<(typeof CORE_SERVICE_SLUGS)[number], string> = {
  "standard-cleaning-cape-town": "Standard cleaning",
  "deep-cleaning-cape-town": "Deep cleaning",
  "move-out-cleaning-cape-town": "Move-out cleaning",
};

const PRICES_PATH = "/cleaning-prices-cape-town";

type Props = { slug: CapeTownSeoServiceSlug };

const linkClass = "font-semibold text-blue-700 underline-offset-2 hover:underline";

/**
 * Commercial-intent internal links on service templates — copy varies by slug to limit near-duplicate blocks across URLs.
 */
export function ServicePageCommercialIntentSection({ slug }: Props) {
  const crossSlugs =
    (CORE_SERVICE_SLUGS as readonly string[]).includes(slug) ?
      CORE_SERVICE_SLUGS.filter((s) => s !== slug)
    : [...CORE_SERVICE_SLUGS];

  const crossRows = crossSlugs.map((s) => ({
    slug: s,
    href: CAPE_TOWN_SERVICE_SEO[s].path,
    label: CORE_LABELS[s],
  }));

  if (slug === "standard-cleaning-cape-town") {
    return (
      <section className="border-b border-blue-100 bg-blue-50/35 py-14" aria-labelledby="svc-commercial-standard-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="svc-commercial-standard-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Keep maintenance cleaning on rhythm in Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Use the{" "}
            <Link href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={linkClass}>
              Cape Town cleaning hub
            </Link>{" "}
            for metro-wide context, then open{" "}
            <Link href="/locations" className={linkClass}>
              suburb hubs
            </Link>{" "}
            for lifts, parking, and access notes.{" "}
            <Link href={PRICES_PATH} className={linkClass}>
              Published from-prices
            </Link>{" "}
            show tier entry bands—your checkout total still reflects the exact rooms you pick.
          </p>
          <ul className="mt-6 space-y-2 text-base leading-relaxed text-zinc-700">
            {crossRows.map((row) => (
              <li key={row.slug}>
                <Link href={row.href} className={linkClass}>
                  {row.label}
                </Link>
                <span className="text-zinc-600">
                  {row.slug === "deep-cleaning-cape-town" ?
                    " — one-off reset when kitchens or wet rooms outgrow a standard checklist."
                  : " — empty-home handovers; not the same cadence as weekly upkeep."}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-zinc-600">
            <strong className="font-semibold text-zinc-800">Booking tip:</strong> choose standard when surfaces are on a fair
            baseline—switch tier before you confirm if this month needs deeper dwell.
          </p>
          <p className="mt-4 text-sm text-zinc-600">
            Customer voices:{" "}
            <Link href="/reviews" className={linkClass}>
              verified reviews
            </Link>
            .
          </p>
        </div>
      </section>
    );
  }

  if (slug === "deep-cleaning-cape-town") {
    return (
      <section className="border-b border-blue-100 bg-blue-50/35 py-14" aria-labelledby="svc-commercial-deep-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="svc-commercial-deep-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Book intensive reset time—not a quick tidy
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Deep visits buy dwell on grease, grout, and edges. Route through{" "}
            <Link href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={linkClass}>
              citywide cleaning context
            </Link>
            , then{" "}
            <Link href="/locations" className={linkClass}>
              your suburb hub
            </Link>{" "}
            for layout-specific notes. Compare dwell-heavy tiers on{" "}
            <Link href={PRICES_PATH} className={linkClass}>
              cleaning prices in Cape Town
            </Link>{" "}
            before you lock bedrooms and baths.
          </p>
          <ul className="mt-6 space-y-2 text-base leading-relaxed text-zinc-700">
            {crossRows.map((row) => (
              <li key={row.slug}>
                <Link href={row.href} className={linkClass}>
                  {row.label}
                </Link>
                <span className="text-zinc-600">
                  {row.slug === "standard-cleaning-cape-town" ?
                    " — return here after a reset to stay on lighter maintenance visits."
                  : " — when the unit is empty and the checklist is handover-led, not detail-reset led."}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-zinc-600">
            <strong className="font-semibold text-zinc-800">Booking tip:</strong> pick deep when build-up—not square metres
            alone—needs the clock; pick move-out only for near-empty inspection scope.
          </p>
          <p className="mt-4 text-sm text-zinc-600">
            Proof and tone:{" "}
            <Link href="/reviews" className={linkClass}>
              verified reviews
            </Link>
            .
          </p>
        </div>
      </section>
    );
  }

  if (slug === "move-out-cleaning-cape-town") {
    return (
      <section className="border-b border-blue-100 bg-blue-50/35 py-14" aria-labelledby="svc-commercial-moveout-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="svc-commercial-moveout-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Handover-led cleaning for empty or nearly empty homes
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Move-out scope assumes inspection evidence, not occupied-home upkeep. Skim the{" "}
            <Link href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={linkClass}>
              Cape Town cleaning hub
            </Link>
            , cross-check{" "}
            <Link href="/locations" className={linkClass}>
              suburb access notes
            </Link>
            , then align add-ons against{" "}
            <Link href={PRICES_PATH} className={linkClass}>
              published move-out from-prices
            </Link>{" "}
            before checkout.
          </p>
          <ul className="mt-6 space-y-2 text-base leading-relaxed text-zinc-700">
            {crossRows.map((row) => (
              <li key={row.slug}>
                <Link href={row.href} className={linkClass}>
                  {row.label}
                </Link>
                <span className="text-zinc-600">
                  {row.slug === "deep-cleaning-cape-town" ?
                    " — occupied heavy reset when you still live in the home; different checklist than vacant handovers."
                  : " — weekly or fortnightly rhythm after you have moved in elsewhere."}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-zinc-600">
            <strong className="font-semibold text-zinc-800">Booking tip:</strong> flag ovens, fridges, and cupboard-emptying in
            the flow so the quote matches what agencies photograph.
          </p>
          <p className="mt-4 text-sm text-zinc-600">
            Social proof:{" "}
            <Link href="/reviews" className={linkClass}>
              verified reviews
            </Link>
            .
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-blue-100 bg-blue-50/35 py-14" aria-labelledby="svc-commercial-default-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="svc-commercial-default-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Next steps across Cape Town services
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Anchor on the{" "}
          <Link href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={linkClass}>
            citywide cleaning hub
          </Link>
          , branch into{" "}
          <Link href="/locations" className={linkClass}>
            suburb pages
          </Link>{" "}
          for local notes, and sanity-check tiers on{" "}
          <Link href={PRICES_PATH} className={linkClass}>
            cleaning prices in Cape Town
          </Link>{" "}
          before you switch service type in the quote builder.
        </p>
        <ul className="mt-6 space-y-2 text-base leading-relaxed text-zinc-700">
          {crossRows.map((row) => (
            <li key={row.slug}>
              <Link href={row.href} className={linkClass}>
                {row.label}
              </Link>
              <span className="text-zinc-600"> — core residential tiers you can compare beside this page.</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-zinc-600">
          Customer voices:{" "}
          <Link href="/reviews" className={linkClass}>
            verified reviews
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
