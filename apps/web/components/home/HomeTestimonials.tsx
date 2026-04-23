import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const quotes = [
  {
    quote: "Booking took two minutes and the team was on time. Our apartment has never felt this fresh.",
    name: "Nadia M.",
    area: "Sea Point",
    rating: 5,
  },
  {
    quote: "Transparent pricing and polite cleaners. We use Shalean for monthly deep cleans now.",
    name: "James T.",
    area: "Claremont",
    rating: 5,
  },
  {
    quote: "Same-day slot saved us before guests arrived. Highly recommend for busy families.",
    name: "Aisha K.",
    area: "Woodstock",
    rating: 5,
  },
] as const;

export function HomeTestimonials() {
  return (
    <section className="px-4 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">What Cape Town says</h2>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">Real feedback from households who book with Shalean.</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {quotes.map(({ quote, name, area, rating }) => (
            <Card key={name} className="text-center shadow-sm">
              <CardContent className="flex flex-col items-center gap-4 p-6 sm:p-8">
                <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star key={i} className="size-5 fill-amber-400 text-amber-400" aria-hidden />
                  ))}
                </div>
                <blockquote className="text-pretty text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
                  &ldquo;{quote}&rdquo;
                </blockquote>
                <footer>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{name}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{area}</p>
                </footer>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
