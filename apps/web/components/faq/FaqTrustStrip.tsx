import { Lock, ShieldCheck, Star } from "lucide-react";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

export function FaqTrustStrip() {
  return (
    <section className="border-y border-zinc-200 bg-zinc-50/90" aria-label="Trust signals">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-medium text-zinc-800 sm:justify-between sm:text-[15px]">
          <li className="flex items-center gap-2">
            <Star className="size-5 fill-amber-400 text-amber-400" aria-hidden />
            <span>{GOOGLE_BUSINESS_REVIEWS.rating} rating</span>
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-700" aria-hidden />
            <span>Background-checked cleaners</span>
          </li>
          <li className="flex items-center gap-2">
            <Lock className="size-5 text-emerald-700" aria-hidden />
            <span>Secure booking</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800" aria-hidden>
              ✓
            </span>
            <span>Thousands of homes served</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
