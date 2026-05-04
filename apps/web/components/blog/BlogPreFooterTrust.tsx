import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import { Star } from "lucide-react";

/** Compact trust strip before the final article CTA. */
export function BlogPreFooterTrust() {
  const { rating, count } = GOOGLE_BUSINESS_REVIEWS;

  return (
    <section
      className="not-prose mt-12 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-6 py-8 text-center shadow-sm sm:px-8"
      aria-label="Why homeowners trust Shalean"
    >
      <div className="flex items-center justify-center gap-0.5 text-amber-500" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-5 w-5 ${i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-300"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold text-zinc-900">
        {rating}★ Google rating · {count}+ reviews
      </p>
      <ul className="mx-auto mt-4 max-w-lg space-y-2 text-left text-sm leading-relaxed text-zinc-600">
        <li className="flex gap-2">
          <span className="font-semibold text-blue-700">·</span>
          <span>Real feedback from Cape Town bookings—not anonymous listings.</span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-blue-700">·</span>
          <span>Transparent quotes tied to the home details you enter online.</span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-blue-700">·</span>
          <span>Support if schedules shift—we focus on dependable handovers.</span>
        </li>
      </ul>
    </section>
  );
}
