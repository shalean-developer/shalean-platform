import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { BadgeCheck, CalendarClock, Home, Star } from "lucide-react";

type Props = {
  location: CapeTownLocationRow;
  trustStats: PublicReviewBannerStats | null;
};

/**
 * E-E-A-T strip for programmatic hubs — uses verified Google aggregate + operational facts only.
 */
export function LocationTrustSignals({ location, trustStats }: Props) {
  const { name } = location;
  const googleAvg = GOOGLE_BUSINESS_REVIEWS.rating;
  const googleCount = GOOGLE_BUSINESS_REVIEWS.count;
  const rpcAvg = trustStats?.avgRating != null ? trustStats.avgRating.toFixed(1) : null;
  const rpcCount = trustStats?.reviewCount;

  const householdLine =
    rpcCount != null && rpcCount >= 50
      ? `Trusted by ${rpcCount}+ verified bookings near ${name} (city-wide Shalean data).`
      : `Trusted by ${googleCount}+ Google-reviewed Cape Town customers—including recurring visits in ${name}.`;

  const ratingLine =
    rpcAvg && rpcCount != null
      ? `Rated ★${rpcAvg}+ from ${rpcCount}+ verified booking reviews.`
      : `Rated ★${googleAvg}+ on Google from ${googleCount}+ local reviews.`;

  return (
    <section
      className="border-b border-blue-100 bg-gradient-to-r from-blue-50/90 via-white to-white py-6"
      aria-label={`Why homeowners in ${name} trust Shalean`}
    >
      <div className="mx-auto max-w-4xl px-4">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li className="flex gap-3 rounded-xl border border-blue-100/80 bg-white/90 px-4 py-3 shadow-sm">
            <Home className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Local trust</p>
              <p className="mt-1 text-sm font-medium leading-snug text-zinc-800">{householdLine}</p>
            </div>
          </li>
          <li className="flex gap-3 rounded-xl border border-blue-100/80 bg-white/90 px-4 py-3 shadow-sm">
            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Vetted teams</p>
              <p className="mt-1 text-sm font-medium leading-snug text-zinc-800">
                Background-checked cleaners with insurance suited to professional home visits—not informal cash-only
                crews.
              </p>
            </div>
          </li>
          <li className="flex gap-3 rounded-xl border border-blue-100/80 bg-white/90 px-4 py-3 shadow-sm">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Availability</p>
              <p className="mt-1 text-sm font-medium leading-snug text-zinc-800">
                Same-day and same-week slots sometimes open in {name}—check live availability after you enter your address.
              </p>
            </div>
          </li>
          <li className="flex gap-3 rounded-xl border border-blue-100/80 bg-white/90 px-4 py-3 shadow-sm">
            <Star className="mt-0.5 h-5 w-5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Ratings</p>
              <p className="mt-1 text-sm font-medium leading-snug text-zinc-800">{ratingLine}</p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
