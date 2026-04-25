import { ShieldCheck, Sparkles, Timer } from "lucide-react";
import type { HomeLocation, HomeReview, HomeService } from "@/lib/home/data";

type TrustBarProps = {
  services: HomeService[];
  locations: HomeLocation[];
  reviews: HomeReview[];
};

export function TrustBar({ services, locations, reviews }: TrustBarProps) {
  const cards = [
    {
      title: `${services.length} cleaning options`,
      body: services.slice(0, 3).map((service) => service.title).join(", "),
      Icon: Sparkles,
    },
    {
      title: `${locations.length} covered areas`,
      body: locations.slice(0, 3).map((location) => location.name).join(", "),
      Icon: ShieldCheck,
    },
    {
      title: `${reviews.length} recent reviews`,
      body: reviews[0]?.quote ?? "",
      Icon: Timer,
    },
  ].filter((card) => card.body);

  if (cards.length === 0) return null;

  return (
    <section aria-label="Trust signals" className="border-y border-blue-100 bg-white">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:px-6 lg:grid-cols-3 lg:px-8">
        {cards.map(({ title, body, Icon }) => (
          <div key={title} className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-5">
            <Icon className="h-5 w-5 text-blue-600" aria-hidden />
            <h2 className="mt-3 text-base font-semibold text-zinc-950">{title}</h2>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
