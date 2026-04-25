import type { HomeReview } from "@/lib/home/data";
import { Card, CardContent } from "@/components/ui/card";

type ReviewsProps = {
  reviews: HomeReview[];
};

export function Reviews({ reviews }: ReviewsProps) {
  if (reviews.length === 0) return null;

  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Reviews</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">What customers say</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="p-6">
                <p className="text-sm font-semibold text-blue-700">{"★".repeat(review.rating)}</p>
                <blockquote className="mt-4 text-base leading-7 text-zinc-700">"{review.quote}"</blockquote>
                {review.author ? <p className="mt-4 text-sm font-semibold text-zinc-950">{review.author}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
