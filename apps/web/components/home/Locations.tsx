import Link from "next/link";
import type { HomeLocation } from "@/lib/home/data";

type LocationsProps = {
  locations: HomeLocation[];
};

export function Locations({ locations }: LocationsProps) {
  if (locations.length === 0) return null;

  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Locations</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">Areas we serve</h2>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {locations.map((location) => {
            const href = location.slug ? `/cleaning-services/${location.slug}` : "#hero-booking";
            return (
              <Link
                key={location.id}
                href={href}
                className="rounded-2xl border border-zinc-100 bg-zinc-50 px-5 py-4 transition hover:border-blue-200 hover:bg-blue-50"
              >
                <h3 className="font-semibold text-zinc-950">{location.name}</h3>
                {location.city ? <p className="mt-1 text-sm text-zinc-600">{location.city}</p> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
