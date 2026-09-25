"use client";

import { HomeBookingLink } from "@/components/home/HomeBookingLink";
import { cn } from "@/lib/utils";

export function HomeMobileStickyCta() {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-blue-100 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(37,99,235,0.12)] backdrop-blur",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="hidden flex-1 md:block">
          <p className="text-sm font-semibold text-zinc-900">Ready to book trusted home cleaning in Cape Town?</p>
          <p className="text-xs text-zinc-600">Get your price and secure your slot in minutes.</p>
        </div>
        <HomeBookingLink
          source="home_sticky_cta"
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99] md:w-auto"
        >
          Book a Cleaning
        </HomeBookingLink>
      </div>
    </div>
  );
}
