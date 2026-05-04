import Link from "next/link";
import { Star } from "lucide-react";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

/** Single persistent trust anchor — links to the dedicated reviews page (no URL fragments). */
export function MarketingStickyTrustBadge() {
  return (
    <Link
      href="/reviews"
      className="fixed bottom-6 left-4 z-40 flex max-w-[min(calc(100vw-5rem),14rem)] items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow-lg backdrop-blur-sm transition hover:border-slate-300 hover:bg-white sm:left-6 sm:max-w-none sm:px-3.5 sm:text-xs print:hidden"
      aria-label={`Google rating ${GOOGLE_BUSINESS_REVIEWS.rating} out of 5, view reviews`}
    >
      <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
      <span className="tabular-nums">{GOOGLE_BUSINESS_REVIEWS.rating}</span>
      <span className="font-medium text-slate-600">Google rating</span>
    </Link>
  );
}
