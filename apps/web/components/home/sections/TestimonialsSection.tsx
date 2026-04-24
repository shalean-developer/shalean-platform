import { Star } from "lucide-react";

const reviews = [
  {
    name: "Sarah M",
    area: "Sea Point",
    service: "Airbnb Cleaning",
    rating: 5,
    comment: "Best cleaning service in Sea Point. Super reliable for Airbnb turnovers and guest-ready bathrooms.",
  },
  {
    name: "Marcus Daniels",
    area: "Green Point",
    service: "Airbnb Cleaning",
    rating: 5,
    comment: "We run two Airbnbs and Shalean makes turnovers fast, consistent, and easy to schedule.",
  },
  {
    name: "Zinhle Mokoena",
    area: "Claremont",
    service: "Deep Cleaning",
    rating: 5,
    comment: "Transparent pricing and friendly cleaners. Shalean is now our monthly deep clean for the whole house.",
  },
  {
    name: "Nadia K",
    area: "Table View",
    service: "Standard Cleaning",
    rating: 5,
    comment: "The booking flow was quick and our home felt fresh again after a busy week.",
  },
  {
    name: "Ayesha F",
    area: "Bellville",
    service: "Move Out Cleaning",
    rating: 5,
    comment: "The move-out clean was handled professionally and the price was clear before checkout.",
  },
] as const;

export function TestimonialsSection() {
  return (
    <section className="border-b border-blue-100 bg-blue-50/30 py-16" aria-labelledby="reviews-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="reviews-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Reviews from Cape Town Customers
          </h2>
          <p className="mt-3 text-gray-600">Homeowners, tenants, and Airbnb hosts who book Shalean when results matter.</p>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          {reviews.map((r) => (
            <li key={r.name} className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-1 text-blue-600" aria-label={`${r.rating} out of 5 stars`}>
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" aria-hidden />
                ))}
              </div>
              <p className="mt-2 font-semibold text-zinc-900">{r.name}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                {r.area} • {r.service}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">&ldquo;{r.comment}&rdquo;</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
