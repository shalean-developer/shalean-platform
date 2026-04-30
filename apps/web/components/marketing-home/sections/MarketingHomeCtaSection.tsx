import Image from "next/image";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { marketingLandingImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

const BOOK_CLEANER_SECTION_IMG = marketingLandingImage("/marketing/book-professional-team-living-room-cape-town.webp");

/** Primary conversion band — server-rendered. */
export function MarketingHomeCtaSection() {
  const bookHref = marketingHomeBookingHref();

  return (
    <section className="scroll-mt-24 bg-slate-50 py-16 md:py-20" aria-labelledby="book-sparkle-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-14 xl:gap-20">
          <div className="max-w-xl lg:max-w-none">
            <p className="text-sm font-medium tracking-wide text-neutral-900">— Book Your Cleaner</p>
            <h2
              id="book-sparkle-heading"
              className="mt-3 text-2xl font-bold leading-[1.15] tracking-tight text-neutral-900 md:text-3xl"
            >
              Your Home Deserves A Sparkle
            </h2>
            <div className="mt-9 rounded-xl border border-slate-100 bg-white p-7 shadow-sm sm:mt-10 sm:p-9">
              <Sparkles className="h-6 w-6 text-neutral-900" strokeWidth={1.25} aria-hidden />
              <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">
                Schedule a cleaning today with our trusted professionals and enjoy a spotless, fresh home without any
                hassle.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <GrowthCtaLink href={bookHref} source="marketing_book_sparkle_book" className={marketingPrimaryCtaClassName}>
                  Book a cleaner
                </GrowthCtaLink>
                <GrowthCtaLink
                  href={bookHref}
                  source="marketing_book_sparkle_arrow"
                  className={marketingPrimaryCtaIconClassName}
                >
                  <span className="sr-only">Book a cleaner</span>
                  <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
                </GrowthCtaLink>
              </div>
            </div>
          </div>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm lg:aspect-[5/4]">
            <Image
              src={BOOK_CLEANER_SECTION_IMG}
              alt="Professional cleaning team working in a bright living room in Cape Town"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
