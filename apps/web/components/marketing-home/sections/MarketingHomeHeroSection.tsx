import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import { BadgeCheck, MousePointerClick, ShieldCheck, Star, ThumbsUp } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { publicTrustAverageDisplay } from "@/lib/home/publicTrustRating";
import { GET_FREE_QUOTE_HREF, getFreeQuoteButtonClass } from "@/lib/marketing/getFreeQuote";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { googleReviewsBasedOnCountLine } from "@/lib/seo/googleReviews";
import { HOME_PAGE_HEADLINE } from "@/lib/seo/homePageMeta";

const HERO_MAIN = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");

const HERO_BENEFITS = [
  { Icon: ShieldCheck, label: "Vetted & trained cleaners" },
  { Icon: ThumbsUp, label: "Satisfaction guaranteed" },
  { Icon: MousePointerClick, label: "Easy online booking" },
] as const;

export function MarketingHomeHeroSection() {
  const bookHref = marketingHomeBookingHref();
  const avg = publicTrustAverageDisplay(null);
  preload(HERO_MAIN, { as: "image", fetchPriority: "high" });

  return (
    <HomeSection className="overflow-hidden border-b border-border py-[var(--ui-space-10)] md:py-[var(--ui-space-16)]">
      <div className="grid grid-cols-1 items-center gap-[var(--ui-space-8)] lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:gap-[var(--ui-space-16)]">
        {/* Keep image first on mobile to preserve current LCP behaviour. */}
        <div className="relative order-1 mx-auto w-full max-w-xl lg:order-2 lg:mx-0 lg:max-w-none">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--ui-radius-2xl)] border border-border bg-muted shadow-[var(--ui-shadow-xl)]">
            <Image
              src={HERO_MAIN}
              alt="Professional house cleaning service in a bright modern kitchen in Cape Town"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              fetchPriority="high"
            />
          </div>

          <div className="absolute bottom-[var(--ui-space-4)] left-[var(--ui-space-3)] flex items-center gap-[var(--ui-space-3)] rounded-[var(--ui-radius-xl)] bg-primary px-[var(--ui-space-4)] py-[var(--ui-space-3)] text-primary-foreground shadow-[var(--ui-shadow-lg)] sm:-left-[var(--ui-space-4)] sm:bottom-[var(--ui-space-6)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-lg)] bg-primary-foreground/15">
              <BadgeCheck className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-[length:var(--ui-text-small)] font-bold leading-none">Instant pricing</p>
              <p className="mt-1 text-[length:var(--ui-text-caption)] leading-tight text-primary-foreground/80">
                See your total before you pay
              </p>
            </div>
          </div>
        </div>

        <div className="order-2 flex flex-col items-center text-center sm:items-start sm:text-left lg:order-1">
          <span className="inline-flex w-fit rounded-[var(--ui-radius-pill)] border border-primary/20 bg-primary/5 px-[var(--ui-space-4)] py-[var(--ui-space-2)] text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.16em] text-primary">
            Cape Town&apos;s trusted cleaning service
          </span>

          <h1 className="mt-[var(--ui-space-5)] max-w-2xl text-[clamp(2.35rem,6vw,4.5rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-foreground">
            {HOME_PAGE_HEADLINE}
          </h1>

          <p className="marketing-hero-lead mt-[var(--ui-space-5)] max-w-xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Professional, reliable and affordable cleaning services for homes, apartments and offices. See your price and book online in minutes.
          </p>

          <div className="mt-[var(--ui-space-6)] grid w-full gap-[var(--ui-space-3)] sm:grid-cols-3">
            {HERO_BENEFITS.map(({ Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-[var(--ui-space-3)] rounded-[var(--ui-radius-lg)] border border-border bg-card px-[var(--ui-space-3)] py-[var(--ui-space-3)] text-left shadow-[var(--ui-shadow-sm)]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </div>
                <span className="text-[length:var(--ui-text-small)] font-medium leading-tight text-foreground">{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-[var(--ui-space-6)] flex w-full flex-col gap-[var(--ui-space-3)] sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href={bookHref}
              data-growth-cta-source="marketing_hero_see_price"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--ui-radius-lg)] bg-primary px-[var(--ui-space-6)] py-[var(--ui-space-3)] text-[length:var(--ui-text-small)] font-semibold text-primary-foreground shadow-[var(--ui-shadow-sm)] transition hover:opacity-90 sm:w-auto"
            >
              See instant price
              <span aria-hidden>→</span>
            </Link>
            <Link
              href={GET_FREE_QUOTE_HREF}
              data-quote-cta-source="marketing_hero"
              className={`${getFreeQuoteButtonClass.outline} w-full sm:w-auto`}
            >
              Request a quote
            </Link>
          </div>

          <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-caption)] text-muted-foreground">
            Instant price is self-service. Request a quote for custom or unusual jobs.
          </p>

          <div className="mt-[var(--ui-space-5)] flex flex-wrap items-center justify-center gap-[var(--ui-space-2)] sm:justify-start">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-card shadow-[var(--ui-shadow-sm)] ring-1 ring-border">
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
            <span className="text-[length:var(--ui-text-small)] font-semibold text-foreground">{avg}</span>
            <span className="text-[length:var(--ui-text-small)] text-muted-foreground">{googleReviewsBasedOnCountLine()}</span>
          </div>

          <p className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-small)] text-muted-foreground">
            Are you a worker?{" "}
            <Link href="/cleaner/apply" className="font-semibold text-primary hover:underline">
              Apply Now
            </Link>
          </p>
        </div>
      </div>
    </HomeSection>
  );
}
