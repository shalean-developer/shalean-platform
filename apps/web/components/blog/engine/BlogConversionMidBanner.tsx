import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { cn } from "@/lib/utils";

type Props = {
  trackingSlug: string;
  className?: string;
};

/** High-conversion mid-article strip — Shalean blue. */
export function BlogConversionMidBanner({ trackingSlug, className }: Props) {
  return (
    <aside
      className={cn(
        "not-prose flex flex-col gap-5 rounded-xl bg-blue-600 px-5 py-6 text-white shadow-lg shadow-blue-900/15 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-8 sm:py-7",
        className,
      )}
      aria-labelledby="blog-mid-conversion-heading"
    >
      <div className="min-w-0">
        <h3 id="blog-mid-conversion-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Treat yourself.
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-blue-50 sm:text-base">
          Let us handle the cleaning—transparent pricing for Cape Town homes before you book.
        </p>
      </div>
      <GrowthCtaLink
        href="/booking"
        source={`blog_${trackingSlug}_mid_blue_banner`}
        blogAnalyticsPlacement={`${trackingSlug}_mid_blue`}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
      >
        Book now
      </GrowthCtaLink>
    </aside>
  );
}
