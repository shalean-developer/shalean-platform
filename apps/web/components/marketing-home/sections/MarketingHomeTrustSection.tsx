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
      className="border-y border-border !bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-20)]"
      aria-labelledby="homepage-trust-heading"
    >
      <MarketingSectionHeader
        eyebrow="Customer proof"
        eyebrowTone="brand"
        title="Trusted by Cape Town customers"
        description="Verified review figures, vetted cleaners and clear booking totals help you know what to expect before you book."
      />

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-5)] sm:grid-cols-2 xl:grid-cols-4">
        <article className="flex min-h-[300px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#f2e3b3] bg-[var(--marketing-surface-soft-yellow)] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
          <div className="flex items-center justify-between gap-[var(--ui-space-4)]">
            <div className="flex items-center gap-1" aria-label="Five star rating">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-4 w-4 fill-[#f4b400] text-[#f4b400]" strokeWidth={1.6} />
              ))}
            </div>
            <span className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.12em] text-foreground/55">
              Google
            </span>
          </div>
          <div className="mt-auto pt-[var(--ui-space-10)]">
            <p className="text-5xl font-semibold leading-none tracking-[-0.04em] text-foreground tabular-nums">{rating}</p>
            <h3 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-card-title)] font-semibold text-foreground">Google rating</h3>
            <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
              Based on {count}+ Google reviews.
            </p>
          </div>
        </article>

        <article className="flex min-h-[300px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#f3d7de] bg-[var(--marketing-surface-soft-blush)] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/80" aria-hidden>
            <MessageSquareText className="h-6 w-6 text-[var(--marketing-accent-rose)]" strokeWidth={1.7} />
          </div>
          <div className="mt-auto pt-[var(--ui-space-10)]">
            <p className="text-5xl font-semibold leading-none tracking-[-0.04em] text-foreground tabular-nums">{count}+</p>
            <h3 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-card-title)] font-semibold text-foreground">Reviews</h3>
            <Link
              href="/reviews"
              className="mt-[var(--ui-space-3)] inline-flex items-center gap-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-medium text-primary hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View customer reviews
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </article>

        <article className="flex min-h-[300px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#cde9e4] bg-[var(--marketing-surface-soft-aqua)] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/80" aria-hidden>
            <ShieldCheck className="h-7 w-7 text-[var(--marketing-accent-teal)]" strokeWidth={1.65} />
          </div>
          <div className="mt-auto pt-[var(--ui-space-10)]">
            <h3 className="text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Vetted cleaners</h3>
            <p className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
              Cleaners are vetted before they are made available for customer bookings.
            </p>
          </div>
        </article>

        <article className="flex min-h-[300px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#e2d8f4] bg-[var(--marketing-surface-soft-lavender)] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/80" aria-hidden>
            <ReceiptText className="h-7 w-7 text-[var(--marketing-accent-violet)]" strokeWidth={1.65} />
          </div>
          <div className="mt-auto pt-[var(--ui-space-10)]">
            <h3 className="text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Clear pricing</h3>
            <p className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
              Review the quoted cleaning total before you complete checkout.
            </p>
          </div>
        </article>
      </div>
    </HomeSection>
  );
}
