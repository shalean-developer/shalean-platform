import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import { ArrowRight, Check, ShieldCheck, Sparkles, Star } from "lucide-react";
import { GET_FREE_QUOTE_HREF } from "@/lib/marketing/getFreeQuote";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

const HERO_MAIN = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");

const HERO_SIGNALS = [
  { icon: ShieldCheck, label: "Vetted professionals", detail: "Trusted in your space" },
  { icon: Sparkles, label: "Clear service standards", detail: "A better clean, every visit" },
  { icon: Star, label: "Local support", detail: "Here when you need us" },
] as const;

export function MarketingHomeHeroSection() {
  const bookHref = marketingHomeBookingHref();

  preload(HERO_MAIN, { as: "image", fetchPriority: "high" });

  return (
    <section className="relative isolate mb-20 bg-[#07194a] text-white md:mb-24">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <Image
          src={HERO_MAIN}
          alt="Professional house cleaning service in a bright modern kitchen in Cape Town"
          fill
          className="object-cover object-center lg:object-[center_42%]"
          sizes="100vw"
          priority
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,19,60,0.97)_0%,rgba(7,36,99,0.9)_43%,rgba(15,69,158,0.48)_72%,rgba(7,25,74,0.18)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,25,74,0.58),transparent_48%)]" />
      </div>

      <div className="mx-auto w-full max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)] pb-28 pt-16 md:pb-36 md:pt-24 lg:min-h-[650px] lg:pt-28">
        <div className="max-w-[760px]">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-100 backdrop-blur">
            <Check className="h-4 w-4" aria-hidden /> Cape Town&apos;s cleaning partner
          </p>
          <h1 className="mt-7 text-[clamp(3rem,7vw,6.75rem)] font-semibold leading-[0.92] tracking-[-0.055em] text-white">
            A cleaner space.
            <span className="mt-2 block text-[#75b8ff]">A brighter day.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-blue-50/90 md:text-xl">
            Professional home and business cleaning, shaped around your schedule and backed by a local team you can reach.
          </p>

          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href={bookHref}
              data-growth-cta-source="marketing_hero_see_price"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#2874ee] px-8 text-base font-semibold text-white shadow-xl transition hover:bg-[#3f87f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#07194a]"
            >
              See instant price
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href={GET_FREE_QUOTE_HREF}
              data-quote-cta-source="marketing_hero"
              className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/35 bg-white/10 px-8 text-base font-semibold text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Request a quote
            </Link>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 translate-y-1/2 px-[var(--ui-page-gutter)]">
        <div className="mx-auto grid max-w-[var(--ui-container-marketing)] overflow-hidden rounded-2xl bg-white text-[#07194a] shadow-[0_24px_70px_rgba(5,24,72,0.22)] sm:grid-cols-3">
          {HERO_SIGNALS.map(({ icon: Icon, label, detail }, index) => (
            <div
              key={label}
              className={`flex items-center gap-4 px-5 py-5 md:px-7 ${index ? "border-t border-slate-200 sm:border-l sm:border-t-0" : ""}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#2365df]">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <strong className="block text-sm font-semibold">{label}</strong>
                <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
