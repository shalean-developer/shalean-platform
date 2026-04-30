import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { publicTrustAverageDisplay } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

const HERO_MAIN = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");
const HERO_TRUST = marketingHeroImage("professional-cleaner-cape-town.webp");

const p = CAPE_TOWN_SERVICE_SEO;

type HeroProps = {
  reviewBanner: PublicReviewBannerStats | null;
};

/**
 * Server-rendered hero: H1, body copy, booking CTA, and visible internal links for SEO (no framer-motion).
 */
export function MarketingHomeHeroSection({ reviewBanner }: HeroProps) {
  const bookHref = marketingHomeBookingHref();
  const avg = publicTrustAverageDisplay(reviewBanner);

  return (
    <section className="relative w-full border-b border-slate-100 bg-white py-12 md:py-16">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="relative z-10 flex w-full max-w-[650px] flex-col justify-center lg:pr-2">
          <div className="flex flex-col justify-center gap-4">
            <div>
              <h1 className="font-sans text-3xl font-bold tracking-tight text-slate-900 leading-[1.05] sm:text-4xl lg:text-[2.6rem] xl:text-[2.9rem]">
                Professional Cleaning Services{" "}
                <br className="hidden lg:block" />
                in Cape Town
              </h1>

              <p className="mt-3 max-w-md text-base leading-relaxed text-slate-600">
                Book trusted home and office cleaners with fast online scheduling, vetted teams, and clear pricing. Serving
                Cape Town with reliable, professional results.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 md:gap-3">
              <GrowthCtaLink href={bookHref} source="marketing_hero_book_cleaner" className={marketingPrimaryCtaClassName}>
                Book a cleaner
              </GrowthCtaLink>
              <GrowthCtaLink
                href={bookHref}
                source="marketing_hero_book_cleaner_arrow"
                className={marketingPrimaryCtaIconClassName}
              >
                <span className="sr-only">Book a cleaner</span>
                <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
              </GrowthCtaLink>
            </div>

            <div className="flex max-w-md items-center gap-4 md:gap-5">
              <div className="relative h-24 w-36 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm sm:h-[6.5rem] sm:w-44 md:h-28 md:w-52">
                <Image
                  src={HERO_TRUST}
                  alt="Professional cleaners greeting a homeowner at the door in Cape Town"
                  fill
                  className="object-cover object-[center_45%]"
                  sizes="208px"
                  priority
                  fetchPriority="high"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Star size={18} className="shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                  <span className="text-lg font-extrabold tracking-tight text-gray-900 md:text-xl">{avg}/5.0</span>
                </div>
                <p className="text-xs font-medium leading-snug text-gray-500 md:text-[0.8125rem]">Trusted by happy homes</p>
              </div>
            </div>

            <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Popular pages">
              <Link href="/services" className={cn(linkInNavClassName, "text-sm")}>
                All services
              </Link>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <Link href={p["standard-cleaning-cape-town"].path} className={cn(linkInNavClassName, "text-sm")}>
                Home cleaning
              </Link>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <Link href={p["deep-cleaning-cape-town"].path} className={cn(linkInNavClassName, "text-sm")}>
                Deep cleaning
              </Link>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <Link href="/locations/claremont-cleaning-services" className={cn(linkInNavClassName, "text-sm")}>
                Claremont
              </Link>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <Link href="/locations/sea-point-cleaning-services" className={cn(linkInNavClassName, "text-sm")}>
                Sea Point
              </Link>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
                Blog
              </Link>
            </nav>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-md items-center sm:max-w-lg lg:mx-0 lg:max-w-none lg:justify-self-end">
          <div className="relative flex w-full items-center pl-0 sm:pl-2 lg:pl-6">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <Image
                src={HERO_MAIN}
                alt="Professional house cleaning service in a bright modern kitchen in Cape Town"
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 100vw, 46vw"
                priority
                fetchPriority="high"
              />
            </div>

            <div className="absolute left-0 top-1/2 z-10 w-[max-content] -translate-x-3 -translate-y-1/2 rounded-xl border border-white/20 bg-[#1e4fd4] px-5 py-4 shadow-sm sm:-translate-x-4 sm:px-6 sm:py-4 md:px-7 md:py-5 lg:-translate-x-[42%] xl:-translate-x-[46%]">
              <span className="block text-2xl font-extrabold leading-none tracking-tight text-white md:text-3xl">100+</span>
              <span className="mt-1.5 block text-[0.6875rem] font-medium leading-tight text-blue-100 md:text-xs">
                Cleaning Experts
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
