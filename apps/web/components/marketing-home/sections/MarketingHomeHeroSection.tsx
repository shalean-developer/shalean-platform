import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import { BadgeCheck, Check, MapPin } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { GET_FREE_QUOTE_HREF } from "@/lib/marketing/getFreeQuote";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
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

  preload(HERO_MAIN, { as: "image", fetchPriority: "high" });

  return (
    <HomeSection
      containerSize="marketing"
      className="overflow-hidden border-b border-border pt-[var(--ui-space-4)] pb-[var(--ui-space-10)] md:pt-[var(--ui-space-6)] md:pb-[var(--ui-space-12)] lg:pt-[var(--ui-space-8)] lg:pb-[5rem]"
    >
      <div className="grid items-center gap-[var(--ui-space-10)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-stretch lg:gap-[var(--ui-space-12)] xl:gap-[var(--ui-space-16)]">
        <div className="flex flex-col items-start text-left lg:h-full lg:justify-between">
          <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-2 text-[length:var(--ui-text-body)] text-foreground">
            <span className="inline-flex items-center gap-2 font-medium">
              <MapPin className="h-4 w-4 text-primary" strokeWidth={2.2} aria-hidden />
              Cape Town, ZA
            </span>
            <span className="text-muted-foreground" aria-hidden>·</span>
            <Link
              href="/areas-we-serve"
              className="font-normal text-muted-foreground transition hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Change city
            </Link>
          </div>

          <div className="mt-[var(--ui-space-6)] lg:mt-0">
            <h1 className="text-[length:var(--ui-text-hero-title)] font-semibold leading-[var(--ui-leading-hero)] tracking-[var(--ui-tracking-hero-title)] text-foreground">
              <span className="block whitespace-nowrap text-primary">{HERO_HEADLINE_ACCENT}</span>
              <span className="block whitespace-nowrap">{HERO_HEADLINE_REST}</span>
            </h1>

            <div className="mt-[var(--ui-space-5)] flex flex-col gap-[var(--ui-space-3)]">
              {HERO_BENEFITS.map((label) => (
                <div key={label} className="flex items-center gap-3 text-[length:var(--ui-text-lead)] font-normal text-foreground">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-[var(--ui-space-6)] flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:mt-0">
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
        </div>

        <div className="relative mx-auto w-full max-w-[580px] lg:mx-0 lg:justify-self-end">
          <div className="relative aspect-[1.13/1] w-full overflow-hidden rounded-[var(--ui-radius-marketing)] bg-muted shadow-[var(--ui-shadow-lg)]">
            <Image
              src={HERO_MAIN}
              alt="Professional house cleaning service in a bright modern kitchen in Cape Town"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 580px"
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
