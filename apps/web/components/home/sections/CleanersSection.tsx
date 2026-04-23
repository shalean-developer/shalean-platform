import { Star } from "lucide-react";

const cleaners = [
  {
    name: "Thandiwe N.",
    initials: "TN",
    rating: 4.9,
    bio: "Detail-led standard and deep cleans. Loves restoring kitchens after busy weeks.",
  },
  {
    name: "Jason L.",
    initials: "JL",
    rating: 4.8,
    bio: "Airbnb specialist — fast turnovers with photo-ready finishes every time.",
  },
  {
    name: "Priya S.",
    initials: "PS",
    rating: 5,
    bio: "Move-in/out expert. Handles fragile finishes and rental inspections with care.",
  },
] as const;

export function CleanersSection() {
  return (
    <section className="border-b border-blue-100 bg-white py-16" aria-labelledby="cleaners-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="cleaners-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Meet a few of our pros
          </h2>
          <p className="mt-3 text-gray-600">Sample profiles of the vetted cleaners you can be matched with after booking.</p>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {cleaners.map((c) => (
            <li key={c.name} className="rounded-2xl border border-gray-200 bg-white p-6 text-center transition hover:border-blue-300 hover:shadow-md">
              <div
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-xl font-bold text-white shadow-md"
                role="img"
                aria-label={`${c.name} avatar`}
              >
                {c.initials}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900">{c.name}</h3>
              <div className="mt-1 flex items-center justify-center gap-1 text-sm font-medium text-blue-600">
                <Star className="h-4 w-4 fill-current" aria-hidden />
                {c.rating} rating
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{c.bio}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
