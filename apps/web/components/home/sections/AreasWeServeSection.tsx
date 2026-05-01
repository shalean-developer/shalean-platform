import Link from "next/link";
import { LocationSelect } from "@/components/locations/LocationSelect";
import { getLocationsByCity } from "@/lib/locations";
import { locationSeoPathFromLegacyAreaSlug } from "@/lib/seo/capeTownSeoPages";

const locations = getLocationsByCity("cape-town");

export function AreasWeServeSection() {
  return (
    <section id="locations" className="scroll-mt-28 border-b border-blue-100 bg-white py-16" aria-labelledby="locations-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="max-w-2xl">
          <h2 id="locations-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Cleaning Services Across Cape Town
          </h2>
          <p className="mt-3 text-gray-600">
            Book cleaning services in Sea Point, Claremont, Gardens, Table View, Durbanville, and more Cape Town areas.
            Tap a suburb to explore local cleaning pages.
          </p>
          <LocationSelect
            className="mt-8 max-w-xl"
            label="Search your suburb"
            navigateOnSelect
          />
        </div>

        <nav className="mt-10" aria-label="Service areas">
          <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {locations.map((loc) => (
              <li key={loc.slug}>
                <Link
                  href={
                    loc.slug === "cape-town"
                      ? "/services"
                      : locationSeoPathFromLegacyAreaSlug(loc.slug) ??
                        `/locations/${loc.slug.replace(/\/$/, "")}-cleaning-services`
                  }
                  className="block rounded-2xl border border-blue-100 bg-blue-50/40 px-4 py-4 text-center text-sm font-semibold text-zinc-900 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  Cleaning services in {loc.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
