import { ArrowRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

export function MarketingHomeFinalCta() {
  const bookHref = marketingHomeBookingHref();

  return (
    <HomeSection tone="brand" className="border-t border-primary-foreground/10">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.16em] text-primary-foreground/75">
          Ready when you are
        </p>
        <h2 className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-primary-foreground md:text-[2rem]">
          Ready for a cleaner home?
        </h2>
        <p className="mt-[var(--ui-space-3)] max-w-2xl text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-primary-foreground/80">
          Choose your service, confirm your details, and see the booking total before you complete your booking.
        </p>
        <div className="mt-[var(--ui-space-6)]">
          <GrowthCtaLink
            href={bookHref}
            source="home_final_cta"
            className="inline-flex min-h-12 items-center justify-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-lg)] bg-background px-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-semibold text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Book a cleaner
            <ArrowRight className="h-4 w-4" aria-hidden />
          </GrowthCtaLink>
        </div>
      </div>
    </HomeSection>
  );
}
