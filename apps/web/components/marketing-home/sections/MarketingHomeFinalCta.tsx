import { ArrowRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

export function MarketingHomeFinalCta() {
  const bookHref = marketingHomeBookingHref();

  return (
    <HomeSection containerSize="marketing" className="bg-background md:py-[var(--ui-space-20)]">
      <div
        className="overflow-hidden rounded-[var(--ui-radius-marketing)] px-[var(--ui-space-6)] py-[var(--ui-space-12)] text-white shadow-[var(--ui-shadow-xl)] sm:px-[var(--ui-space-10)] md:py-[var(--ui-space-16)] lg:px-[var(--ui-space-16)]"
        style={{ background: "linear-gradient(135deg, var(--navy-from), var(--navy-to))" }}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="text-[length:var(--ui-text-small)] font-semibold uppercase tracking-[0.14em] text-white/60">
            Ready when you are
          </p>
          <h2 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-page-title)] font-semibold leading-[1.08] tracking-[-0.03em] text-white md:text-[length:var(--ui-text-hero-title)]">
            Ready for a cleaner home?
          </h2>
          <p className="mt-[var(--ui-space-5)] max-w-2xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-white/75">
            Choose your service and see your cleaning total before you complete your booking.
          </p>
          <div className="mt-[var(--ui-space-8)]">
            <GrowthCtaLink
              href={bookHref}
              source="home_final_cta"
              className="inline-flex min-h-14 items-center justify-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-pill)] bg-white px-[var(--ui-space-8)] text-[length:var(--ui-text-body)] font-medium text-foreground shadow-[var(--ui-shadow-md)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--navy-to)]"
            >
              See instant price
              <ArrowRight className="h-4 w-4" aria-hidden />
            </GrowthCtaLink>
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
