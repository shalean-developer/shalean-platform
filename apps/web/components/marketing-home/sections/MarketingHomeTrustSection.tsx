import Link from "next/link";
import { ArrowRight, MessageSquareText, ReceiptText, ShieldCheck, Star } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

export function MarketingHomeTrustSection() {
  const { rating, count } = GOOGLE_BUSINESS_REVIEWS;

  return (
    <HomeSection
      className="border-y border-border bg-background md:py-[var(--ui-space-20)]"
      aria-labelledby="homepage-trust-heading"
    >
      <header className="mx-auto max-w-5xl text-center">
        <p className="text-[length:var(--ui-text-body)] font-medium uppercase tracking-[0.08em] text-primary">
          Customer proof
        </p>
        <h2
          id="homepage-trust-heading"
          className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground"
        >
          Rated by customers on Google
        </h2>
        <p className="mx-auto mt-[var(--ui-space-4)] max-w-4xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-muted-foreground">
          The homepage review figures use the same verified Google Business Profile aggregate as Shalean&apos;s structured data.
        </p>
      </header>

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] sm:grid-cols-2 xl:grid-cols-4">
        <article className="flex min-h-[360px] flex-col items-center rounded-[32px] border border-[#f2e3b3] bg-[#fffaf0] px-[var(--ui-space-6)] py-[var(--ui-space-10)] text-center text-foreground shadow-[var(--ui-shadow-md)] transition-transform duration-200 hover:-translate-y-1 dark:border-border dark:bg-muted">
          <div className="flex min-h-20 items-center justify-center rounded-full border border-[#f2e3b3] bg-background px-[var(--ui-space-5)] shadow-[var(--ui-shadow-sm)]" aria-label="Five star rating">
            <div className="flex items-center gap-1" aria-hidden>
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-6 w-6 fill-[#f4b400] text-[#f4b400]" strokeWidth={1.6} />
              ))}
            </div>
          </div>

          <p className="mt-[var(--ui-space-8)] text-6xl font-semibold leading-none tracking-[-0.04em] text-foreground tabular-nums">
            {rating}
          </p>
          <h3 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
            Google rating
          </h3>
          <p className="mx-auto mt-[var(--ui-space-3)] max-w-xs text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Based on {count}+ Google reviews
          </p>
        </article>

        <article className="flex min-h-[360px] flex-col items-center rounded-[32px] border border-[#f3d7de] bg-[#fff4f6] px-[var(--ui-space-6)] py-[var(--ui-space-10)] text-center text-foreground shadow-[var(--ui-shadow-md)] transition-transform duration-200 hover:-translate-y-1 dark:border-border dark:bg-muted">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[#f3d7de] bg-background shadow-[var(--ui-shadow-sm)]" aria-hidden>
            <MessageSquareText className="h-12 w-12 text-[#ec6f86]" strokeWidth={1.55} />
          </div>

          <p className="mt-[var(--ui-space-8)] text-6xl font-semibold leading-none tracking-[-0.04em] text-foreground tabular-nums">
            {count}+
          </p>
          <h3 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
            Google reviews
          </h3>
          <p className="mx-auto mt-[var(--ui-space-3)] max-w-xs text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Browse Shalean&apos;s review page for customer feedback and review information.
          </p>

          <div className="mt-auto pt-[var(--ui-space-6)]">
            <Link
              href="/reviews"
              className="inline-flex items-center gap-2 text-[length:var(--ui-text-body)] font-medium text-primary transition hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              View reviews
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </article>

        <article className="flex min-h-[360px] flex-col items-center rounded-[32px] border border-[#cde9e4] bg-[#eefaf8] px-[var(--ui-space-6)] py-[var(--ui-space-10)] text-center text-foreground shadow-[var(--ui-shadow-md)] transition-transform duration-200 hover:-translate-y-1 dark:border-border dark:bg-muted">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[#cde9e4] bg-background shadow-[var(--ui-shadow-sm)]" aria-hidden>
            <ShieldCheck className="h-14 w-14 text-[#38a991]" strokeWidth={1.5} />
          </div>

          <h3 className="mt-[var(--ui-space-10)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
            Background-checked cleaners
          </h3>
          <p className="mx-auto mt-[var(--ui-space-4)] max-w-xs text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Cleaners are vetted before they are available for customer bookings.
          </p>
        </article>

        <article className="flex min-h-[360px] flex-col items-center rounded-[32px] border border-[#e2d8f4] bg-[#f7f3ff] px-[var(--ui-space-6)] py-[var(--ui-space-10)] text-center text-foreground shadow-[var(--ui-shadow-md)] transition-transform duration-200 hover:-translate-y-1 dark:border-border dark:bg-muted">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[#e2d8f4] bg-background shadow-[var(--ui-shadow-sm)]" aria-hidden>
            <ReceiptText className="h-13 w-13 text-[#8060e8]" strokeWidth={1.5} />
          </div>

          <h3 className="mt-[var(--ui-space-10)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
            Transparent booking totals
          </h3>
          <p className="mx-auto mt-[var(--ui-space-4)] max-w-xs text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Customers can review the quoted cleaning total before confirming checkout.
          </p>
        </article>
      </div>
    </HomeSection>
  );
}
