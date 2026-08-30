import { ArrowRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

export function MarketingHomeFinalCta() {
  const bookHref = marketingHomeBookingHref();

  return (
    <HomeSection tone="brand" containerSize="marketing" className="border-t border-primary-foreground/10 md:py-[var(--ui-space-20)]">
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <p className="text-[length:var(--ui-text-body)] font-medium uppercase tracking-[0.08em] text-primary-foreground/70">
          Ready when you are
        </p>
        <h2 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-primary-foreground md:text-[2.75rem]">
          Ready for a cleaner home?
        </h2>
        <p className="mt-[var(--ui-space-4)] max-w-2xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-primary-foreground/75">
          Choose your service and see your cleaning total before you complete your booking.
        </p>
        <div className="mt-[var(--ui-space-8)]">
          <GrowthCtaLink
            href={bookHref}
            source="home_final_cta"
            className="inline-flex min-h-14 items-center justify-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-pill)] bg-background px-[var(--ui-space-8)] text-[length:var(--ui-text-body)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            See instant price
            <ArrowRight className="h-4 w-4" aria-hidden />
          </GrowthCtaLink>
        </div>
      </div>
    </HomeSection>
  );
}
