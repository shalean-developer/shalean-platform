import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Quote } from "lucide-react";
import { marketingLandingImage } from "@/lib/marketing/marketingHomeAssets";

const mimg = marketingLandingImage;
const ABOUT_SHOWCASE_IMG = mimg("/images/marketing/shalean-cleaner-balcony-cape-town.webp");

/** About + testimonial — server-rendered for SEO. */
export function MarketingHomeAboutSection() {
  return (
    <section id="about" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-slate-500">— About Us</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.35rem] lg:leading-[1.15]">
              More Than Cleaning
              <br />
              We Care For Your Space
            </h2>
          </div>
          <div className="lg:pt-1">
            <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              We started with a simple belief: a clean home brings a clear mind. From humble beginnings with a small
              team, today we proudly serve hundreds of homes and offices, delivering spotless results with care, honesty,
              and eco-friendly solutions.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5 md:mt-8 md:gap-3">
              <Link
                href="/services"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-10"
              >
                Explore us
              </Link>
              <Link
                href="/services"
                aria-label="Explore our services"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
              >
                <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-10 lg:mt-20 lg:flex-row lg:items-end lg:gap-5 xl:gap-8">
          <div className="w-full shrink-0 lg:min-w-0 lg:flex-1">
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[20rem] overflow-hidden rounded-[1.75rem] shadow-md ring-1 ring-black/5 sm:rounded-3xl lg:mx-0 lg:max-w-none">
              <Image
                src={ABOUT_SHOWCASE_IMG}
                alt="Shalean cleaner in uniform mopping a sunny tiled balcony by the water in Cape Town"
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 100vw, 33vw"
              />
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col items-start gap-5 lg:min-w-0 lg:flex-1 lg:gap-6 lg:self-end">
            <div className="box-border flex aspect-square w-40 max-w-full shrink-0 flex-col justify-center self-end rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:w-44 sm:p-5">
              <p className="flex items-center gap-1.5 text-lg font-bold leading-snug tracking-tight text-slate-900 sm:gap-2 sm:text-2xl">
                <ArrowRight className="size-[1.1em] shrink-0 text-slate-700" strokeWidth={2} aria-hidden />
                Since 2022
              </p>
              <p className="mt-2 text-[0.65rem] leading-tight text-slate-500 sm:mt-2.5 sm:text-[11px] sm:leading-snug">
                Trusted by thousands of homes across Cape Town
              </p>
            </div>
            <div className="box-border flex w-full max-w-xs shrink-0 flex-col justify-center overflow-hidden rounded-2xl bg-[#1e4fd4] px-6 py-5 text-left text-white shadow-lg shadow-blue-900/25 ring-1 ring-white/15 sm:px-7 sm:py-6 lg:aspect-square lg:w-48 lg:max-w-none lg:self-start lg:px-5 lg:py-5 xl:w-52">
              <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-4xl lg:text-2xl xl:text-3xl">4,500+</p>
              <p className="mt-2 text-sm leading-snug text-blue-100 sm:mt-3 lg:text-[11px] lg:leading-snug">
                Delivering spotless homes across Cape Town every week
              </p>
            </div>
          </div>

          <div className="relative w-full shrink-0 overflow-hidden rounded-3xl border border-emerald-100/60 bg-gradient-to-br from-[#eef6df] via-[#f4f9ec] to-[#faf8ef] p-8 shadow-md ring-1 ring-black/[0.04] sm:p-9 lg:min-w-0 lg:flex-1">
            <Quote
              className="pointer-events-none absolute left-6 top-6 h-14 w-14 text-emerald-300/90 sm:left-8 sm:top-8 sm:h-16 sm:w-16"
              strokeWidth={1}
              aria-hidden
            />
            <blockquote className="relative pt-10 text-base font-medium leading-relaxed text-slate-800 sm:pt-12 sm:text-lg">
              Shalean completely transformed my apartment in Claremont. The team was professional, fast, and paid
              attention to every detail. It honestly felt like walking into a brand-new home.
            </blockquote>
            <footer className="relative mt-8 flex items-center gap-4 border-t border-emerald-900/10 pt-8">
              <div
                className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-sm font-bold tracking-tight text-emerald-900 ring-2 ring-white shadow-md"
                aria-hidden
              >
                SM
              </div>
              <div>
                <cite className="not-italic">
                  <span className="block text-base font-bold text-slate-900">Sarah M.</span>
                  <span className="mt-0.5 block text-sm text-slate-500">Claremont</span>
                </cite>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </section>
  );
}
