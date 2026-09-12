import { ArrowRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

type Props = {
  eyebrow?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaSource?: string;
  href?: string;
};

export function MarketingHomeFinalCta({
  eyebrow = "Ready when you are",
  title = "Ready for a cleaner home?",
  description = "Choose your service and see your cleaning total before you complete your booking.",
  ctaLabel = "See instant price",
  ctaSource = "home_final_cta",
  href,
}: Props = {}) {
  const bookHref = href ?? marketingHomeBookingHref();

  return (
    <HomeSection containerSize="marketing" className="bg-background md:py-[var(--ui-space-20)]">
      <div
        className="overflow-hidden rounded-[var(--ui-radius-marketing)] px-[var(--ui-space-6)] py-[var(--ui-space-12)] text-white shadow-[var(--ui-shadow-xl)] sm:px-[var(--ui-space-10)] md:py-[var(--ui-space-16)] lg:px-[var(--ui-space-16)]"
        style={{ background: "linear-gradient(135deg, var(--navy-from), var(--navy-to))" }}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="text-[length:var(--ui-text-small)] font-semibold uppercase tracking-[0.14em] text-white/60">
            {eyebrow}
          </p>
          <h2 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-page-title)] font-semibold leading-[1.08] tracking-[-0.03em] text-white md:text-[length:var(--ui-text-hero-title)]">
            {title}
          </h2>
          <p className="mt-[var(--ui-space-5)] max-w-2xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-white/75">
            {description}
          </p>
          <div className="mt-[var(--ui-space-8)]">
            <GrowthCtaLink
              href={bookHref}
              source={ctaSource}
              className="inline-flex min-h-14 items-center justify-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-pill)] bg-white px-[var(--ui-space-8)] text-[length:var(--ui-text-body)] font-medium text-foreground shadow-[var(--ui-shadow-md)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--navy-to)]"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </GrowthCtaLink>
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
