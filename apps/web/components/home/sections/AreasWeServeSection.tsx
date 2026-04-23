import Link from "next/link";

type Loc = { label: string; href: string };

const locations: Loc[] = [
  { label: "Cape Town", href: "/" },
  { label: "Claremont", href: "/cleaning-services/claremont" },
  { label: "Rondebosch", href: "/booking?step=entry&area=rondebosch" },
  { label: "Landsdowne", href: "/booking?step=entry&area=landsdowne" },
  { label: "Wynberg", href: "/booking?step=entry&area=wynberg" },
];

export function AreasWeServeSection() {
  return (
    <section id="locations" className="scroll-mt-28 border-b border-blue-100 bg-white py-16" aria-labelledby="locations-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="max-w-2xl">
          <h2 id="locations-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Locations we serve
          </h2>
          <p className="mt-3 text-gray-600">
            Shalean dispatches teams across the Cape Town metro. Tap a suburb to explore local house cleaning — more neighbourhood pages are rolling out weekly.
          </p>
        </div>

        <nav className="mt-10" aria-label="Service areas">
          <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {locations.map((loc) => (
              <li key={loc.label}>
                <Link
                  href={loc.href}
                  className="block rounded-2xl border border-blue-100 bg-blue-50/40 px-4 py-4 text-center text-sm font-semibold text-zinc-900 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  {loc.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
