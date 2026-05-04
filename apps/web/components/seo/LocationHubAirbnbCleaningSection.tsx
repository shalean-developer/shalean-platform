import Link from "next/link";
import { airbnbAreaLandingPathForLocationHub } from "@/lib/seo/airbnbAreaLandingPages";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  locationName: string;
  hubSlug: string;
};

export function LocationHubAirbnbCleaningSection({ locationName, hubSlug }: Props) {
  const airbnbMain = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;
  const areaLanding = airbnbAreaLandingPathForLocationHub(hubSlug);

  return (
    <section className="border-b border-zinc-100 bg-white py-14" aria-labelledby={`hub-airbnb-${hubSlug}`}>
      <div className="mx-auto max-w-4xl px-4">
        <h2 id={`hub-airbnb-${hubSlug}`} className="text-2xl font-bold tracking-tight text-zinc-900">
          Airbnb cleaning in {locationName}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Short-stay hosts in {locationName} need turnovers that respect guest photos—kitchens, bathrooms, floors, and
          high-touch points reset between check-out and the next arrival. Scope follows what you select online; notes carry
          parking, lifts, and estate rules so crews spend minutes cleaning—not hunting access.
        </p>
        <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700">
          <li>Turnover checklist parity with your listing gallery—cushions, towels, and consumables staged visibly.</li>
          <li>Illustrative pricing bands on suburb hubs pair with locked totals once bedrooms and bathrooms are confirmed.</li>
          <li>
            Central playbook lives on Shalean&apos;s{" "}
            <Link href={airbnbMain} className={linkEmphasisClassName}>
              Airbnb cleaning Cape Town
            </Link>{" "}
            service guide—use it when you manage multiple properties across the city.
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={airbnbMain}
            className="inline-flex rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Airbnb turnover cleaning (Cape Town)
          </Link>
          {areaLanding ? (
            <Link
              href={areaLanding}
              className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-900 transition hover:border-emerald-400"
            >
              Airbnb cleaning in {locationName} (local guide)
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
