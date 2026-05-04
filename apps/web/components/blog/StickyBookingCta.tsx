"use client";

import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

type Props = {
  trackingSlug: string;
};

/** Optional sticky conversion bar for long blog articles. */
export function StickyBookingCta({ trackingSlug }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-4 print:hidden">
      <div className="pointer-events-auto mx-4 flex max-w-lg flex-wrap items-center justify-center gap-3 rounded-2xl border border-blue-100 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-nowrap sm:px-6">
        <p className="text-center text-sm font-medium text-zinc-800">Ready to book?</p>
        <GrowthCtaLink
          href="/booking"
          source={`blog_${trackingSlug}_sticky_cta`}
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Book a cleaner
        </GrowthCtaLink>
        <Link href="/locations/cape-town-cleaning-services" className="text-xs font-medium text-blue-600 underline-offset-4 hover:underline">
          Service areas
        </Link>
      </div>
    </div>
  );
}
