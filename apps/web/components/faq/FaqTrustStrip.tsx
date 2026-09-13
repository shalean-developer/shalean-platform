import { Lock, ShieldCheck, Star } from "lucide-react";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

export function FaqTrustStrip() {
  return (
    <section className="border-y border-border bg-muted/70" aria-label="Trust signals">
      <PublicPageContainer className="py-8">
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-medium text-foreground sm:justify-between sm:text-[15px]">
          <li className="flex items-center gap-2">
            <Star className="size-5 fill-amber-400 text-amber-400" aria-hidden />
            <span>{GOOGLE_BUSINESS_REVIEWS.rating} rating</span>
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-blue-700" aria-hidden />
            <span>Background-checked cleaners</span>
          </li>
          <li className="flex items-center gap-2">
            <Lock className="size-5 text-blue-700" aria-hidden />
            <span>Secure booking</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800" aria-hidden>
              ✓
            </span>
            <span>Thousands of homes served</span>
          </li>
        </ul>
      </PublicPageContainer>
    </section>
  );
}
