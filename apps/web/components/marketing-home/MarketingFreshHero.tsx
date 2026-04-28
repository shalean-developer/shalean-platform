"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowUpRight, Star } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

/** Large hero — vacuum / bright living room (matches design reference). */
const HERO_MAIN =
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=960&q=85";
/** Small trust strip — cleaner in a home setting. */
const HERO_CLEANER =
  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.12,
      duration: 0.58,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

type MarketingFreshHeroProps = {
  bookHref: string;
};

export function MarketingFreshHero({ bookHref }: MarketingFreshHeroProps) {
  return (
    <section
      className="relative w-full border-b border-black/[0.04]"
      style={{
        background:
          "linear-gradient(145deg, #fafcf4 0%, #f4f7ec 38%, #ecf3e0 72%, #e3ead6 100%), radial-gradient(ellipse 85% 70% at 100% 20%, rgba(255, 252, 235, 0.55) 0%, transparent 55%)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:px-10 md:py-10 lg:grid lg:min-h-0 lg:grid-cols-2 lg:items-center lg:gap-x-10 lg:gap-y-0 lg:px-12 lg:py-11 xl:gap-x-14">
        {/* LEFT */}
        <div className="relative z-10 flex max-w-xl flex-col lg:max-w-none lg:pr-2">
          <h1 className="font-sans text-4xl font-extrabold leading-[1.06] tracking-tight text-gray-900 sm:text-5xl md:text-6xl lg:text-[3.35rem] lg:leading-[1.05] xl:text-7xl">
            <div className="overflow-hidden">
              <motion.span
                custom={0}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="block"
              >
                A Clean Home
              </motion.span>
            </div>
            <div className="overflow-hidden">
              <motion.span
                custom={1}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="block"
              >
                A Fresh Start
              </motion.span>
            </div>
          </h1>

          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-gray-600 md:text-base"
          >
            Professional cleaning you can trust whether it&apos;s your home, office, or that one messy corner.
          </motion.p>

          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="mt-9 flex flex-wrap items-center gap-2.5 md:mt-10 md:gap-3"
          >
            <GrowthCtaLink
              href={bookHref}
              source="marketing_hero_book_cleaner"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9 md:text-[0.9375rem]"
            >
              Book a Cleaner
            </GrowthCtaLink>
            <GrowthCtaLink
              href={bookHref}
              source="marketing_hero_book_cleaner_arrow"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
            >
              <span className="sr-only">Book a cleaner</span>
              <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
            </GrowthCtaLink>
          </motion.div>

          <motion.div
            custom={4}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="mt-10 flex max-w-md items-center gap-4 md:mt-12 md:gap-5"
          >
            <div className="relative h-[5.5rem] w-[6.75rem] shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 sm:h-24 sm:w-[7.25rem] md:h-[6.75rem] md:w-40">
              <Image
                src={HERO_CLEANER}
                alt="Professional cleaner at work in a home"
                fill
                className="object-cover object-center"
                sizes="160px"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Star size={18} className="shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                <span className="text-lg font-extrabold tracking-tight text-gray-900 md:text-xl">4.9/5.0</span>
              </div>
              <p className="text-xs font-medium leading-snug text-gray-500 md:text-[0.8125rem]">
                Trusted by happy homes
              </p>
            </div>
          </motion.div>
        </div>

        {/* RIGHT — portrait frame + badge straddling inner edge */}
        <motion.div
          initial={{ opacity: 0, x: 48, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.72, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto mt-10 w-full max-w-md sm:max-w-lg lg:mx-0 lg:mt-0 lg:max-w-none lg:justify-self-end"
        >
          <div className="relative pl-0 sm:pl-2 lg:pl-6">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[2rem] shadow-[0_25px_60px_-15px_rgba(15,23,42,0.28)] ring-1 ring-black/5 sm:rounded-[2.25rem] md:rounded-[2.5rem]">
              <Image
                src={HERO_MAIN}
                alt="Professional cleaning — vacuuming in a bright living room"
                fill
                className="object-cover object-[center_65%] sm:object-center"
                sizes="(max-width: 1024px) 100vw, 46vw"
                priority
              />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.65, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 top-1/2 z-10 w-[max-content] -translate-x-3 -translate-y-1/2 rounded-2xl bg-[#1e4fd4] px-5 py-4 shadow-xl shadow-blue-900/25 ring-1 ring-white/20 sm:-translate-x-4 sm:px-6 sm:py-4 md:rounded-[1.25rem] md:px-7 md:py-5 lg:-translate-x-[42%] xl:-translate-x-[46%]"
            >
              <span className="block text-2xl font-extrabold leading-none tracking-tight text-white md:text-3xl">
                100+
              </span>
              <span className="mt-1.5 block text-[0.6875rem] font-medium leading-tight text-blue-100 md:text-xs">
                Cleaning Experts
              </span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
