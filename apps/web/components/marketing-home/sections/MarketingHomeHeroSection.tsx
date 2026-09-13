import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import { ArrowRight, Check } from "lucide-react";
import { GET_FREE_QUOTE_HREF } from "@/lib/marketing/getFreeQuote";
import { marketingHeroImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

const HERO_MAIN = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");

const HERO_STORIES = [
  {
    title: "Homes refreshed",
    detail: "Reliable cleaning for everyday living.",
    href: "/services/standard-cleaning-cape-town",
    image: marketingHeroImage("home-stories/homes-refreshed-cape-town.webp"),
    position: "object-center",
  },
  {
    title: "Moving made easier",
    detail: "Detailed care before or after a move.",
    href: "/services/move-out-cleaning-cape-town",
    image: marketingHeroImage("home-stories/moving-made-easier-cape-town.webp"),
    position: "object-center",
  },
  {
    title: "Workplaces cared for",
    detail: "Professional cleaning for productive spaces.",
    href: "/services/office-cleaning-cape-town",
    image: marketingHeroImage("home-stories/workplaces-cared-for-cape-town.webp"),
    position: "object-center",
  },
] as const;

export function MarketingHomeHeroSection() {
  const bookHref = marketingHomeBookingHref();

  preload(HERO_MAIN, { as: "image", fetchPriority: "high" });

  return (
    <section className="relative isolate mb-40 bg-[#00164e] text-white md:mb-44">
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
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,22,78,0.98)_0%,rgba(0,51,161,0.9)_43%,rgba(0,0,140,0.48)_72%,rgba(0,22,78,0.18)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,22,78,0.58),transparent_48%)]" />
      </div>

      <div className="mx-auto w-full max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)] pb-32 pt-14 md:pb-40 md:pt-20 lg:min-h-[560px] lg:pt-24">
        <div className="max-w-[660px]">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white">
            <Check className="h-4 w-4" aria-hidden /> Cape Town&apos;s cleaning partner
          </p>
          <h1 className="mt-5 text-[clamp(2.75rem,5vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-white">
            A cleaner space.
            <span className="mt-2 block text-[#0051ff]">A brighter day.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/90 md:text-lg">
            Professional home and business cleaning, shaped around your schedule and backed by a local team you can reach.
          </p>

          <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href={bookHref}
              data-growth-cta-source="marketing_hero_see_price"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#0051ff] px-6 text-sm font-semibold uppercase tracking-wide text-white shadow-lg transition hover:bg-[#0033a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#00164e]"
            >
              See instant price
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href={GET_FREE_QUOTE_HREF}
              data-quote-cta-source="marketing_hero"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/50 bg-white/10 px-6 text-sm font-semibold uppercase tracking-wide text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Request a quote
            </Link>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 translate-y-[58%] px-[var(--ui-page-gutter)]">
        <div className="mx-auto max-w-[var(--ui-container-marketing)]">
          <p className="mb-3 text-sm font-medium text-white">Cleaning stories</p>
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
            {HERO_STORIES.map(({ title, detail, href, image, position }) => (
              <Link
                key={title}
                href={href}
                className="group relative aspect-[1.7/1] min-w-[82vw] snap-start overflow-hidden rounded-lg bg-[#00164e] shadow-[0_18px_44px_rgba(0,22,78,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0051ff] focus-visible:ring-offset-2 sm:min-w-0"
              >
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className={`object-cover ${position} transition duration-300 group-hover:scale-[1.03]`}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-[#00164e]/95 via-[#00164e]/15 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <strong className="block text-lg font-semibold">{title}</strong>
                  <span className="mt-1 block text-sm text-white/80">{detail}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
