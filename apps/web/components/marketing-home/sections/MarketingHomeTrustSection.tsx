import Link from "next/link";
import { ArrowRight, MessageSquareText, ReceiptText, ShieldCheck, Star } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

export function MarketingHomeTrustSection() {
  const { rating, count } = GOOGLE_BUSINESS_REVIEWS;

  return (
    <HomeSection
      containerSize="marketing"
      className="border-y border-border !bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-24)]"
      aria-label="Customer proof"
    >
      <MarketingSectionHeader
        eyebrow="Customer proof"
        eyebrowTone="brand"
        title="Trusted by Cape Town customers"
        description="Verified reviews, vetted cleaners and clear booking totals make it easier to book with confidence."
      />

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <article className="flex min-h-[470px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#f2e3b3] bg-[var(--marketing-surface-soft-yellow)] p-[var(--ui-space-8)] shadow-[var(--ui-shadow-md)] md:p-[var(--ui-space-10)]">
          <div className="flex items-center justify-between gap-[var(--ui-space-4)]">
            <span className="text-[length:var(--ui-text-small)] font-semibold uppercase tracking-[0.14em] text-foreground/55">
              Google rating
            </span>
            <div className="flex items-center gap-1" aria-label="Five star rating">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-5 w-5 fill-[#f4b400] text-[#f4b400]" strokeWidth={1.6} />
              ))}
            </div>
          </div>

          <div className="mt-auto">
            <p className="text-[5rem] font-semibold leading-none tracking-[-0.055em] text-foreground tabular-nums md:text-[6.5rem]">
              {rating}
            </p>
            <h3 className="mt-[var(--ui-space-5)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
              Rated by Cape Town customers
            </h3>
            <Link
              href="/reviews"
              className="mt-[var(--ui-space-6)] inline-flex items-center gap-[var(--ui-space-2)] text-[length:var(--ui-text-body)] font-medium text-primary hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Read customer reviews
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </article>

        <div className="grid gap-[var(--ui-space-6)] sm:grid-cols-2">
          <article className="flex min-h-[200px] items-center justify-between gap-[var(--ui-space-6)] rounded-[var(--ui-radius-marketing)] border border-[#f3d7de] bg-[var(--marketing-surface-soft-blush)] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)] sm:col-span-2 md:p-[var(--ui-space-8)]">
            <div>
              <p className="text-5xl font-semibold leading-none tracking-[-0.04em] text-foreground tabular-nums">{count}+</p>
              <h3 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-card-title)] font-semibold text-foreground">Google reviews</h3>
              <p className="mt-[var(--ui-space-2)] max-w-md text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                Customer feedback is available on Shalean&apos;s review page.
              </p>
            </div>
            <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-background/80 text-[var(--marketing-accent-rose)] sm:flex" aria-hidden>
              <MessageSquareText className="h-8 w-8" strokeWidth={1.6} />
            </div>
          </article>

          <article className="flex min-h-[245px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#cde9e4] bg-[var(--marketing-surface-soft-aqua)] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)] md:p-[var(--ui-space-8)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background/80 text-[var(--marketing-accent-teal)]" aria-hidden>
              <ShieldCheck className="h-7 w-7" strokeWidth={1.65} />
            </div>
            <div className="mt-auto pt-[var(--ui-space-8)]">
              <h3 className="text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Vetted cleaners</h3>
              <p className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                Cleaners are vetted before they are made available for customer bookings.
              </p>
            </div>
          </article>

          <article className="flex min-h-[245px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#e2d8f4] bg-[var(--marketing-surface-soft-lavender)] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)] md:p-[var(--ui-space-8)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background/80 text-[var(--marketing-accent-violet)]" aria-hidden>
              <ReceiptText className="h-7 w-7" strokeWidth={1.65} />
            </div>
            <div className="mt-auto pt-[var(--ui-space-8)]">
              <h3 className="text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Clear pricing</h3>
              <p className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                Review the quoted cleaning total before you complete checkout.
              </p>
            </div>
          </article>
        </div>
      </div>
    </HomeSection>
  );
}
