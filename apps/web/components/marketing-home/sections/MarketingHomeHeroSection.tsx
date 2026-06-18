import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, ThumbsUp, MousePointerClick, Star, Users } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { publicTrustAverageDisplay } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

const HERO_MAIN = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");

type HeroProps = {
  reviewBanner: PublicReviewBannerStats | null;
};

export function MarketingHomeHeroSection({ reviewBanner }: HeroProps) {
  const bookHref = marketingHomeBookingHref();
  const avg = publicTrustAverageDisplay(reviewBanner);

  return (
    <section className="relative w-full bg-white py-6 md:py-8 lg:py-10">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">

        {/* Left column */}
        <div className="flex flex-col gap-6">

          {/* Badge */}
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-700">
            Cape Town&apos;s trusted cleaning service
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[2.85rem] xl:text-5xl">
            Book trusted home cleaning across Cape Town
          </h1>

          {/* Supporting paragraph */}
          <p className="max-w-lg text-base leading-relaxed text-slate-600">
            Professional, reliable and affordable cleaning services for homes, apartments and offices. Book in minutes online.
          </p>

          {/* Benefit icons */}
          <div className="flex flex-wrap gap-4 sm:gap-5">
            {[
              { Icon: ShieldCheck, label: "Vetted & trained cleaners" },
              { Icon: ThumbsUp, label: "Satisfaction guaranteed" },
              { Icon: MousePointerClick, label: "Easy online booking" },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <Icon className="h-4 w-4 text-blue-600" strokeWidth={2} aria-hidden />
                </div>
                {label}
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            <GrowthCtaLink
              href={bookHref}
              source="marketing_hero_book_cleaning"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Book a cleaning
              <span aria-hidden className="ml-0.5">→</span>
            </GrowthCtaLink>
            <Link
              href="/services"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              View our services
            </Link>
          </div>

          {/* Google rating row */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
              {/* Google G */}
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            </div>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={i <= 4 ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4 fill-amber-400 text-amber-400"}
                  aria-hidden
                />
              ))}
            </div>
            <span className="text-sm font-semibold text-slate-800">{avg}</span>
            <span className="text-sm text-slate-500">Based on 120+ reviews</span>
          </div>
        </div>

        {/* Right column — image + floating card */}
        <div className="relative mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-xl">
            <Image
              src={HERO_MAIN}
              alt="Professional house cleaning service in a bright modern kitchen in Cape Town"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              fetchPriority="high"
            />
          </div>

          {/* Floating stats card */}
          <div className="absolute -left-4 bottom-6 z-10 flex items-center gap-3 rounded-2xl bg-blue-600 px-5 py-4 shadow-lg sm:-left-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <Users className="h-5 w-5 text-white" aria-hidden />
            </div>
            <div>
              <p className="text-xl font-extrabold leading-none tracking-tight text-white">100+</p>
              <p className="mt-1 text-xs font-medium leading-tight text-blue-100">Happy customers<br />this week</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
