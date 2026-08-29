import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import { BadgeCheck, Check, Star } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { publicTrustAverageDisplay } from "@/lib/home/publicTrustRating";
import { GET_FREE_QUOTE_HREF } from "@/lib/marketing/getFreeQuote";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { googleReviewsBasedOnCountLine } from "@/lib/seo/googleReviews";
import { HOME_PAGE_HEADLINE } from "@/lib/seo/homePageMeta";

const HERO_MAIN = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");
const HERO_HEADLINE_ACCENT = "Cleaning Services";
const HERO_HEADLINE_REST = HOME_PAGE_HEADLINE.startsWith(`${HERO_HEADLINE_ACCENT} `)
  ? HOME_PAGE_HEADLINE.slice(HERO_HEADLINE_ACCENT.length + 1)
  : HOME_PAGE_HEADLINE;

const HERO_BENEFITS = [
  "Vetted and trained cleaners",
  "See your price before you pay",
  "Book online in minutes",
] as const;

export function MarketingHomeHeroSection() {
  const bookHref = marketingHomeBookingHref();
  const avg = publicTrustAverageDisplay(null);

  preload(HERO_MAIN, { as: "image", fetchPriority: "high" });

  return (
    <HomeSection className="overflow-hidden border-b border-border py-[var(--ui-space-10)] md:py-[var(--ui-space-14)] lg:py-[5rem]">
      <div className="grid items-center gap-[var(--ui-space-10)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-[var(--ui-space-14)] xl:gap-[var(--ui-space-16)]">
        <div className="flex flex-col items-start text-left">
          <div className="inline-flex items-center rounded-full bg-muted p-1 text-[length:var(--ui-text-body)] text-foreground">
            <Link
              href={bookHref}
              data-growth-cta-source="marketing_hero_mode_book"
              className="rounded-full border border-border bg-background px-5 py-2.5 font-normal shadow-[var(--ui-shadow-sm)] transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

          <h1 className="mt-[var(--ui-space-8)] max-w-[700px] text-[clamp(2.75rem,5.2vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-foreground">
            <span className="block text-primary">{HERO_HEADLINE_ACCENT}</span>
            <span className="block">{HERO_HEADLINE_REST}</span>
          </h1>

          <div className="mt-[var(--ui-space-7)] flex flex-col gap-[var(--ui-space-4)]">
            {HERO_BENEFITS.map((label) => (
              <div key={label} className="flex items-center gap-3 text-[length:var(--ui-text-lead)] font-normal text-foreground">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-[var(--ui-space-8)] flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href={bookHref}
              data-growth-cta-source="marketing_hero_see_price"
              className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-primary px-8 py-3.5 text-[length:var(--ui-text-body)] font-medium text-primary-foreground shadow-[var(--ui-shadow-sm)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
            >
              See instant price
            </Link>
            <Link
              href={GET_FREE_QUOTE_HREF}
              data-quote-cta-source="marketing_hero"
              className="inline-flex min-h-14 w-full items-center justify-center rounded-full border border-border bg-background px-8 py-3.5 text-[length:var(--ui-text-body)] font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
            >
              Request a quote
            </Link>
          </div>

          <div className="mt-[var(--ui-space-7)] flex flex-wrap items-center gap-2.5">
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

          <p className="mt-[var(--ui-space-5)] text-[length:var(--ui-text-body)] font-normal text-muted-foreground">
            Looking for cleaning work?{" "}
            <Link href="/cleaner/apply" className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
              Apply Now
            </Link>
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[660px] lg:mx-0 lg:justify-self-end">
          <div className="relative aspect-[1.13/1] w-full overflow-hidden rounded-[32px] bg-muted shadow-[var(--ui-shadow-lg)]">
            <Image
              src={HERO_MAIN}
              alt="Professional house cleaning service in a bright modern kitchen in Cape Town"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 660px"
              priority
              fetchPriority="high"
            />
          </div>

          <div className="absolute bottom-4 right-4 flex items-center gap-3 rounded-full bg-background px-4 py-2.5 text-[length:var(--ui-text-body)] text-foreground shadow-[var(--ui-shadow-lg)] ring-1 ring-border sm:bottom-5 sm:right-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <BadgeCheck className="h-4 w-4" aria-hidden />
            </span>
            <span className="font-medium">Trusted Cape Town cleaning</span>
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
