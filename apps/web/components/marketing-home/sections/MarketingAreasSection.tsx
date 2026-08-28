import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { ArrowUpRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { HomeSectionHeader } from "@/components/marketing-home/primitives/HomeSectionHeader";
import type { HomeLocation } from "@/lib/home/data";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { mergeSuburbAreaLinks, suburbHrefByDisplayName } from "@/lib/marketing/marketingAreaLinks";
import { linkInParagraphClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const POPULAR_AREA_NAMES = ["Sea Point", "Claremont", "Constantia", "Bellville", "Durbanville"] as const;

type Props = {
  locations: HomeLocation[];
};

/**
 * Unified areas section — layout aligned with the canonical homepage section system.
 * Location/CMS inputs and link destinations remain authoritative outside this component.
 */
export function MarketingAreasSection({ locations }: Props) {
  const bookHref = marketingHomeBookingHref();
  const allSuburbs = mergeSuburbAreaLinks(locations);

  const chipClass = cn(
    "inline-flex w-full min-w-0 justify-center rounded-[var(--ui-radius-lg)] border border-border bg-card px-[var(--ui-space-3)] py-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-normal leading-snug text-card-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary lg:justify-start",
  );

  return (
    <HomeSection id="locations" className="scroll-mt-24 border-t border-border">
      <div className="grid gap-[var(--ui-space-8)] lg:grid-cols-2 lg:items-start lg:gap-[var(--ui-space-12)]">
        <HomeSectionHeader eyebrow="Areas We Serve" title="Cleaning services across Cape Town suburbs" />

        <div className="max-w-xl space-y-[var(--ui-space-4)] text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
          <p>
            We currently serve the areas below. Add your address at checkout to confirm availability for your home or
            office.
          </p>
          <p>
            Browse all{" "}
            <SafeInternalLink href="/services" className={linkInParagraphClassName}>
              cleaning services
            </SafeInternalLink>
            , read the{" "}
            <SafeInternalLink href="/blog" className={linkInParagraphClassName}>
              blog
            </SafeInternalLink>
            , or{" "}
            <SafeInternalLink href="/book" className={linkInParagraphClassName}>
              book a cleaner online
            </SafeInternalLink>
            .
          </p>
        </div>
      </div>

      <div className="mt-[var(--ui-space-10)]">
        <h3 className="text-[length:var(--ui-text-card-title)] font-semibold text-foreground">Popular cleaning areas</h3>
        <div className="mt-[var(--ui-space-3)] flex flex-wrap gap-[var(--ui-space-2)]" aria-label="Popular cleaning areas">
          {POPULAR_AREA_NAMES.map((name) => {
            const href = suburbHrefByDisplayName(name);
            const className =
              "inline-flex rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-3)] py-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-medium text-card-foreground shadow-[var(--ui-shadow-sm)] transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary";
            return href ? (
              <SafeInternalLink key={name} href={href} className={className}>
                {name}
              </SafeInternalLink>
            ) : (
              <span key={name} className={className}>
                {name}
              </span>
            );
          })}
        </div>
      </div>

      <ul
        className="mt-[var(--ui-space-10)] grid grid-cols-1 gap-[var(--ui-space-2)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        aria-label="All Cape Town suburbs we serve"
      >
        {allSuburbs.map(({ name, href }) => (
          <li key={name} className="min-w-0">
            {href ? (
              <SafeInternalLink href={href} className={chipClass}>
                {name}
              </SafeInternalLink>
            ) : (
              <span className={chipClass}>{name}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-[var(--ui-space-10)] flex flex-wrap items-center gap-[var(--ui-space-3)]">
        <GrowthCtaLink href={bookHref} source="marketing_areas_book_cleaner" className={marketingPrimaryCtaClassName}>
          Book a cleaner
        </GrowthCtaLink>
        <GrowthCtaLink
          href={bookHref}
          source="marketing_areas_book_cleaner_arrow"
          className={marketingPrimaryCtaIconClassName}
        >
          <span className="sr-only">Book a cleaner</span>
          <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
        </GrowthCtaLink>
        <SafeInternalLink
          href="/areas-we-serve"
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--ui-radius-lg)] border border-border bg-card px-[var(--ui-space-5)] text-[length:var(--ui-text-small)] font-semibold text-card-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          View all suburbs
        </SafeInternalLink>
      </div>
    </HomeSection>
  );
}
