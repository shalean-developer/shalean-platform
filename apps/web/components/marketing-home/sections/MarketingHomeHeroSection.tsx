import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import { Check } from "lucide-react";
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
      className="overflow-hidden bg-background pt-[var(--ui-space-10)] pb-[var(--ui-space-16)] md:pt-[var(--ui-space-16)] md:pb-[var(--ui-space-20)] lg:py-[var(--ui-space-24)]"
    >
      <div className="grid items-center gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-[var(--ui-space-16)] xl:gap-[var(--ui-space-20)]">
        <div className="max-w-2xl">
          <h1 className="text-[length:var(--ui-text-hero-title)] font-semibold leading-[var(--ui-leading-hero)] tracking-[var(--ui-tracking-hero-title)] text-foreground">
            <span className="block text-primary">{HERO_HEADLINE_ACCENT}</span>
            <span className="mt-[var(--ui-space-2)] block lg:whitespace-nowrap">{HERO_HEADLINE_REST}</span>
          </h1>

          <div className="mt-[var(--ui-space-10)] space-y-[var(--ui-space-4)]">
            {HERO_BENEFITS.map((label) => (
              <div
                key={label}
                className="flex items-center gap-[var(--ui-space-3)] text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-foreground"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-[var(--ui-space-10)] flex w-full flex-col gap-[var(--ui-space-3)] sm:w-auto sm:flex-row">
            <Link
              href={bookHref}
              data-growth-cta-source="marketing_hero_see_price"
              className="inline-flex min-h-14 items-center justify-center rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-8)] text-[length:var(--ui-text-body)] font-medium text-primary-foreground shadow-[var(--ui-shadow-md)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              See instant price
            </Link>
            <Link
              href={GET_FREE_QUOTE_HREF}
              data-quote-cta-source="marketing_hero"
              className="inline-flex min-h-14 items-center justify-center rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-8)] text-[length:var(--ui-text-body)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Request a quote
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[580px] lg:mx-0 lg:justify-self-end">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--ui-radius-marketing)] bg-muted shadow-[var(--ui-shadow-xl)] ring-1 ring-border/70">
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
        </div>
      </div>
    </HomeSection>
  );
}
