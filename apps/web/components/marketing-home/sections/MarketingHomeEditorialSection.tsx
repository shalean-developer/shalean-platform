import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { marketingHeroImage } from "@/lib/marketing/marketingHomeAssets";

const EDITORIAL_IMAGE = marketingHeroImage("home-stories/where-cleaner-living-begins-cape-town.webp");

export function MarketingHomeEditorialSection() {
  return (
    <HomeSection containerSize="marketing" className="!bg-[#F5F7FB] pb-16 pt-24 md:pb-24 md:pt-32">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0051FF]">Where cleaner living begins</p>
        <h2 className="mt-5 text-[clamp(2rem,4vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.035em] text-[#00164E]">
          Cleaning shaped around real Cape Town spaces.
        </h2>
        <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
          From everyday home care to detailed resets, moving handovers and professional workplaces, Shalean brings the right service and local support to every booking.
        </p>
      </div>

      <div className="relative mt-10 aspect-[4/5] min-h-[440px] overflow-hidden rounded-lg bg-[#00164E] shadow-[var(--ui-shadow-lg)] sm:aspect-[4/3] md:mt-20 md:aspect-[16/8] md:min-h-[360px] md:max-h-[720px]">
        <Image
          src={EDITORIAL_IMAGE}
          alt="Shalean cleaning team arriving together at a Cape Town home"
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px"
          className="object-cover object-[38%_center] sm:object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#00164E]/95 via-[#00164E]/15 to-transparent sm:from-[#00164E]/85 sm:via-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-5 p-5 text-white sm:flex-row sm:items-end sm:justify-between sm:p-6 md:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Professional care, delivered locally</p>
            <p className="mt-2 max-w-xl text-xl font-medium leading-tight md:text-3xl">A dependable cleaning team for the moments that matter.</p>
          </div>
          <Link href="/about" className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-[#0051FF] px-5 text-sm font-semibold uppercase tracking-wide text-white hover:bg-[#0033A1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-auto">
            <Play className="h-4 w-4" aria-hidden /> Our story <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </HomeSection>
  );
}
