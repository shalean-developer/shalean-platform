import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { bookingFlowHref, bookingFlowPromoExtra } from "@/lib/booking/bookingFlow";
import { marketingHeroImage } from "@/lib/marketing/marketingHomeAssets";
import { cn } from "@/lib/utils";

const HERO_SRC = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");

export function HeroSection() {
  const quoteHref = bookingFlowHref("quote", { ...(bookingFlowPromoExtra("SAVE10") ?? {}), source: "cape_town_main" });
  const bookHref = bookingFlowHref("entry", { ...(bookingFlowPromoExtra("SAVE10") ?? {}), source: "cape_town_main" });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-zinc-50 via-white to-blue-50/40 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-900 dark:to-blue-950/20">
      <div className="grid gap-10 px-6 py-12 md:grid-cols-2 md:items-center md:gap-12 md:px-10 md:py-16 lg:px-12">
        <div className="order-2 flex flex-col gap-6 md:order-1">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-900 md:text-5xl dark:text-zinc-50">
            Cleaning Services in Cape Town
          </h1>
          <div className="max-w-xl space-y-4 text-pretty text-base leading-relaxed text-zinc-600 md:text-lg dark:text-zinc-300">
            <p>
              Looking for reliable cleaning services in Cape Town? Shalean connects you with trusted, professional cleaners across the city, from Claremont and Rondebosch to Sea Point and the CBD.
            </p>
            <p>
              Whether you need regular home cleaning, a deep clean, or a move-out service, you can book a cleaner in Cape Town in minutes with transparent pricing and flexible scheduling.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button size="xl" className="rounded-xl shadow-md" asChild>
              <Link href={quoteHref}>Get Instant Quote</Link>
            </Button>
            <Button size="xl" variant="outline" className="rounded-xl border-zinc-300 bg-white/80 dark:border-zinc-600 dark:bg-zinc-900/80" asChild>
              <Link href={bookHref}>Book a Cleaner</Link>
            </Button>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <div
            className={cn(
              "relative aspect-[4/3] w-full overflow-hidden rounded-xl shadow-lg ring-1 ring-zinc-900/5",
              "md:aspect-[5/4]",
            )}
          >
            <Image
              src={HERO_SRC}
              alt="Professional home cleaning in Cape Town"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
