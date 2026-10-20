import Link from "next/link";
import { Quote, Star } from "lucide-react";
import { reviewServicePresentation, type PublicReview } from "@/lib/reviews/publicReviewDetails";

export function PublicReviewCards({ reviews, showSource = false }: { reviews: PublicReview[]; showSource?: boolean }) {
  return <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
    {reviews.map((review) => {
      const service = reviewServicePresentation(review.serviceKey);
      const name = review.displayName || "Verified customer";
      return <figure key={review.id} className="relative m-0 flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm">
        <Quote className="absolute right-5 top-5 h-8 w-8 text-sky-100" aria-hidden="true" />
        <div className="mb-4 flex gap-1" role="img" aria-label={`${review.rating} out of 5 stars`}>
          {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-5 w-5 ${i < review.rating ? "fill-current text-amber-500" : "text-slate-300"}`} aria-hidden="true" />)}
        </div>
        {showSource ? <p className="mb-3 text-xs font-semibold text-sky-800">Verified booking · Shalean</p> : null}
        <blockquote className="m-0 flex-1 whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">{review.comment}</blockquote>
        <figcaption className="mt-5 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 font-semibold text-sky-800">{review.displayName ? name.split(" ").map((part) => part[0]).join("").slice(0, 2) : "VC"}</span>
            <span className="font-semibold text-foreground">{name}</span>
          </div>
          {service || review.suburb ? <p className="mb-2">{service ? <Link href={service.href} className="text-sky-800 underline decoration-sky-200 underline-offset-4 hover:decoration-sky-800">{service.title}</Link> : null}{service && review.suburb ? " · " : null}{review.suburb}</p> : null}
          <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" })}</time>
        </figcaption>
      </figure>;
    })}
  </div>;
}
