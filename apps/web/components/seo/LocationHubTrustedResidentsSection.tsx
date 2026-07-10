import Link from "next/link";
import { Star } from "lucide-react";
import type { LocationHubMarketingReviewSnippet } from "@/lib/seo/location-hub-marketing-reviews";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  locationName: string;
  snippets: readonly LocationHubMarketingReviewSnippet[];
};

export function LocationHubTrustedResidentsSection({ locationName, snippets }: Props) {
  return (
    <section className="border-b border-zinc-100 py-12" aria-labelledby="hub-local-trust-residents-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="hub-local-trust-residents-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Trusted by residents in {locationName}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          We’ve helped homeowners, tenants, and Airbnb hosts across {locationName} maintain spotless homes with reliable,
          professional cleaning services.
        </p>

        {snippets.length > 0 ? (
          <>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {snippets.map((s) => {
                const place = s.suburbLabel || locationName;
                return (
                  <li
                    key={s.id}
                    className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-zinc-900">
                      <span>{s.reviewerLabel}</span>
                      <span className="text-zinc-400" aria-hidden>
                        ·
                      </span>
                      <span className="font-medium text-zinc-600">{place}</span>
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-900">
                        <Star className="h-3.5 w-3.5 fill-blue-600 text-blue-600" aria-hidden />
                        {s.rating}/5
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-700">&ldquo;{s.commentExcerpt}&rdquo;</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-6 text-sm text-zinc-500">
              Recent verified booking reviews mentioning {locationName}.{" "}
              <Link href="/reviews" className={`font-semibold ${linkEmphasisClassName}`}>
                Read more reviews
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
