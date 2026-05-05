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

type Props = { slug: CapeTownSeoServiceSlug };

/**
 * Dense commercial-intent internal links on service templates (beyond RelatedLinks).
 */
export function ServicePageCommercialIntentSection({ slug }: Props) {
  const crossServices = CORE_SERVICE_SLUGS.filter((s) => s !== slug).map((s) => ({
    slug: s,
    href: CAPE_TOWN_SERVICE_SEO[s].path,
    label: CORE_LABELS[s],
  }));

  const linkClass = "font-semibold text-blue-700 underline-offset-2 hover:underline";

  return (
    <section className="border-b border-blue-100 bg-blue-50/35 py-14" aria-labelledby="svc-commercial-intent-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="svc-commercial-intent-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Explore cleaning services in Cape Town
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Start from the{" "}
          <Link href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={linkClass}>
            Cape Town cleaning hub
          </Link>{" "}
          for city-wide context, then open{" "}
          <Link href="/locations" className={linkClass}>
            suburb cleaning hubs
          </Link>{" "}
          when you want parking, lifts, and local notes before checkout. Compare transparent totals on{" "}
          <Link href="/cleaning-prices-cape-town" className={linkClass}>
            cleaning prices in Cape Town
          </Link>{" "}
          when you are budgeting.
        </p>
        {crossServices.length > 0 ? (
          <ul className="mt-6 space-y-2 text-base leading-relaxed text-zinc-700">
            {crossServices.map((row) => (
              <li key={row.slug}>
                <Link href={row.href} className={linkClass}>
                  {row.label}
                </Link>
                <span className="text-zinc-600">
                  {" "}
                  — book the same vetted crews with address-locked scope (switch service type before you confirm).
                </span>
              </li>
            ))}
          </ul>
        ) : null}
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
