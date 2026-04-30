import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { publicTrustAverageDisplay } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
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
    <section
      className="relative w-full border-b border-black/[0.04]"
      style={{
        background:
          "linear-gradient(145deg, #fafcf4 0%, #f4f7ec 38%, #ecf3e0 72%, #e3ead6 100%), radial-gradient(ellipse 85% 70% at 100% 20%, rgba(255, 252, 235, 0.55) 0%, transparent 55%)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:px-10 md:py-10 lg:grid lg:min-h-0 lg:grid-cols-2 lg:items-center lg:gap-x-10 lg:gap-y-0 lg:px-12 lg:py-11 xl:gap-x-14">
        <div className="relative z-10 flex max-w-xl flex-col lg:max-w-none lg:pr-2">
          <h1 className="font-sans text-4xl font-extrabold leading-[1.06] tracking-tight text-gray-900 sm:text-5xl md:text-6xl lg:text-[3.35rem] lg:leading-[1.05] xl:text-7xl">
            Professional Cleaning Services in Cape Town
          </h1>

          <p className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-gray-600 md:text-base">
            Book trusted home and office cleaners with fast online scheduling, vetted teams, and clear pricing. Serving
            Cape Town with reliable, professional results.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-2.5 md:mt-10 md:gap-3">
            <GrowthCtaLink
              href={bookHref}
              source="marketing_hero_book_cleaner"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9 md:text-[0.9375rem]"
            >
              Book a cleaner
            </GrowthCtaLink>
            <GrowthCtaLink
              href={bookHref}
              source="marketing_hero_book_cleaner_arrow"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
            >
              <span className="sr-only">Book a cleaner</span>
              <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
            </GrowthCtaLink>
          </div>

          <nav className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-blue-800 md:mt-9" aria-label="Popular pages">
            <Link href="/services" className="underline-offset-4 hover:underline">
              All services
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link href={p["standard-cleaning-cape-town"].path} className="underline-offset-4 hover:underline">
              Home cleaning
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link href={p["deep-cleaning-cape-town"].path} className="underline-offset-4 hover:underline">
              Deep cleaning
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link href="/locations/claremont-cleaning-services" className="underline-offset-4 hover:underline">
              Claremont
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link href="/locations/sea-point-cleaning-services" className="underline-offset-4 hover:underline">
              Sea Point
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link href="/blog" className="underline-offset-4 hover:underline">
              Blog
            </Link>
          </nav>

          <div className="mt-10 flex max-w-md items-center gap-4 md:mt-12 md:gap-5">
            <div className="relative h-24 w-36 shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 sm:h-[6.5rem] sm:w-44 md:h-28 md:w-52">
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
        </div>

        <div className="relative mx-auto mt-10 w-full max-w-md sm:max-w-lg lg:mx-0 lg:mt-0 lg:max-w-none lg:justify-self-end">
          <div className="relative pl-0 sm:pl-2 lg:pl-6">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[2rem] shadow-[0_25px_60px_-15px_rgba(15,23,42,0.28)] ring-1 ring-black/5 sm:rounded-[2.25rem] md:rounded-[2.5rem]">
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

            <div className="absolute left-0 top-1/2 z-10 w-[max-content] -translate-x-3 -translate-y-1/2 rounded-2xl bg-[#1e4fd4] px-5 py-4 shadow-xl shadow-blue-900/25 ring-1 ring-white/20 sm:-translate-x-4 sm:px-6 sm:py-4 md:rounded-[1.25rem] md:px-7 md:py-5 lg:-translate-x-[42%] xl:-translate-x-[46%]">
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
