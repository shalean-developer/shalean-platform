import Link from "next/link";
import { Check, Star } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { publicTrustAverageDisplay } from "@/lib/home/publicTrustRating";
import { GET_FREE_QUOTE_HREF } from "@/lib/marketing/getFreeQuote";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { googleReviewsBasedOnCountLine } from "@/lib/seo/googleReviews";
import { HOME_PAGE_HEADLINE } from "@/lib/seo/homePageMeta";

const HERO_BENEFITS = [
  "Vetted and trained cleaners",
  "See your price before you pay",
  "Book online in minutes",
] as const;

export function MarketingHomeHeroSection() {
  const bookHref = marketingHomeBookingHref();
  const avg = publicTrustAverageDisplay(null);

  return (
    <HomeSection className="overflow-hidden border-b border-border py-[var(--ui-space-12)] md:py-[var(--ui-space-16)] lg:py-[5.5rem]">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center text-center">
        <div className="inline-flex items-center rounded-full bg-muted p-1 text-[length:var(--ui-text-body)] text-foreground ring-1 ring-border">
          <Link
            href={bookHref}
            data-growth-cta-source="marketing_hero_mode_book"
            className="rounded-full bg-background px-5 py-2.5 font-normal shadow-[var(--ui-shadow-sm)] transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Book a Service
          </Link>
          <Link
            href={GET_FREE_QUOTE_HREF}
            data-quote-cta-source="marketing_hero_mode_quote"
            className="rounded-full px-5 py-2.5 font-normal text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Request a Quote
          </Link>
        </div>

        <h1 className="mt-[var(--ui-space-7)] max-w-[980px] text-[clamp(3rem,7vw,6.4rem)] font-semibold leading-[0.94] tracking-[-0.055em] text-foreground">
          {HOME_PAGE_HEADLINE}
        </h1>

        <p className="marketing-hero-lead mt-[var(--ui-space-6)] max-w-3xl text-[length:var(--ui-text-lead)] font-normal leading-[1.55] text-muted-foreground md:text-[1.25rem]">
          Professional cleaning for homes, apartments, Airbnb stays and workplaces across Cape Town. Choose your service, see your price and book online.
        </p>

        <div className="mt-[var(--ui-space-7)] flex max-w-4xl flex-col items-start gap-3 text-left sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-7 sm:gap-y-3">
          {HERO_BENEFITS.map((label) => (
            <div key={label} className="flex items-center gap-2.5 text-[length:var(--ui-text-body)] font-normal text-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-foreground">
                <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-[var(--ui-space-8)] flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href={bookHref}
            data-growth-cta-source="marketing_hero_see_price"
            className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-primary px-8 py-3.5 text-[length:var(--ui-text-body)] font-normal text-primary-foreground shadow-[var(--ui-shadow-sm)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
          >
            See instant price
          </Link>
          <Link
            href={GET_FREE_QUOTE_HREF}
            data-quote-cta-source="marketing_hero"
            className="inline-flex min-h-14 w-full items-center justify-center rounded-full border border-border bg-background px-8 py-3.5 text-[length:var(--ui-text-body)] font-normal text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            Request a quote
          </Link>
        </div>

        <div className="mt-[var(--ui-space-7)] flex flex-wrap items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card shadow-[var(--ui-shadow-sm)] ring-1 ring-border">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          </div>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="h-4 w-4 fill-warning text-warning" aria-hidden />
            ))}
          </div>
          <span className="text-[length:var(--ui-text-body)] font-normal text-foreground">{avg}</span>
          <span className="text-[length:var(--ui-text-body)] font-normal text-muted-foreground">{googleReviewsBasedOnCountLine()}</span>
        </div>

        <p className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-body)] font-normal text-muted-foreground">
          Looking for cleaning work?{" "}
          <Link href="/cleaner/apply" className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
            Apply Now
          </Link>
        </p>
      </div>
    </HomeSection>
  );
}
