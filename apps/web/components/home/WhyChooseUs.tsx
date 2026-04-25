import { CheckCircle2 } from "lucide-react";
import type { HomeReview, HomeService } from "@/lib/home/data";

type WhyChooseUsProps = {
  services: HomeService[];
  reviews: HomeReview[];
};

export function WhyChooseUs({ services, reviews }: WhyChooseUsProps) {
  const serviceFeatures = services.flatMap((service) => service.features).slice(0, 4);
  const reviewSignals = reviews
    .filter((review) => review.rating >= 5)
    .map((review) => review.quote)
    .slice(0, 2);
  const points = [...serviceFeatures, ...reviewSignals].slice(0, 6);

  if (points.length === 0) return null;

  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Why Choose Us</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">Built for reliable home care</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {points.map((point) => (
            <div key={point} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
              <p className="mt-3 text-sm leading-6 text-zinc-700">{point}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
