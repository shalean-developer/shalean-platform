import { Star } from "lucide-react";

const reviews = [
  {
    name: "Leah van der Merwe",
    rating: 5,
    comment: "Booking took minutes and the crew was punctual. Our kitchen and bathrooms finally feel guest-ready again.",
  },
  {
    name: "Marcus Daniels",
    rating: 5,
    comment: "We run two Airbnbs — turnovers are fast, consistent, and guests notice the little details.",
  },
  {
    name: "Zinhle Mokoena",
    rating: 5,
    comment: "Transparent pricing and friendly cleaners. Shalean is now our monthly deep clean.",
  },
] as const;

export function TestimonialsSection() {
  return (
    <section className="border-b border-blue-100 bg-blue-50/30 py-16" aria-labelledby="reviews-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="reviews-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Reviews from real homes
          </h2>
          <p className="mt-3 text-gray-600">Homeowners, hosts, and busy parents who book Shalean on repeat.</p>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {reviews.map((r) => (
            <li key={r.name} className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-1 text-blue-600" aria-label={`${r.rating} out of 5 stars`}>
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" aria-hidden />
                ))}
              </div>
              <p className="mt-2 font-semibold text-zinc-900">{r.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">&ldquo;{r.comment}&rdquo;</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
