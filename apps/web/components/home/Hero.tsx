import type { HomeLocation, HomeReview, HomeService } from "@/lib/home/data";
import { BookingWidget } from "@/components/booking/BookingWidget";

type HeroProps = {
  services: HomeService[];
  locations: HomeLocation[];
  reviews: HomeReview[];
};

export function Hero({ services, locations, reviews }: HeroProps) {
  const averageRating =
    reviews.length > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null;
  const locationLabel = locations[0]?.city ?? locations[0]?.name ?? "Cape Town";

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-gradient-to-b from-blue-50 via-white to-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -right-24 top-8 h-80 w-80 rounded-full bg-blue-100/80 blur-3xl" />
        <div className="absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-emerald-100/60 blur-3xl" />
      </div>
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_31rem] lg:items-start lg:px-8 lg:py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Shalean Cleaning Services</p>
          <h1 id="hero-heading" className="mt-4 text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl">
            Home Cleaning Services Cape Town
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
            Book a vetted cleaner, see your estimate instantly, and add the extras your home needs before checkout.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-zinc-950">{services.length}</p>
              <p className="mt-1 text-sm text-zinc-600">bookable services</p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-zinc-950">{locations.length}</p>
              <p className="mt-1 text-sm text-zinc-600">service areas</p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-zinc-950">
                {averageRating ? averageRating.toFixed(1) : "New"}
              </p>
              <p className="mt-1 text-sm text-zinc-600">{locationLabel} rating</p>
            </div>
          </div>
        </div>
        <BookingWidget services={services} />
      </div>
    </section>
  );
}
