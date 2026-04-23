"use client";

import { HomeBookingLink } from "@/components/home/HomeBookingLink";
import { cn } from "@/lib/utils";

export function HomeMobileStickyCta() {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-blue-100 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(37,99,235,0.12)] backdrop-blur md:hidden",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      <HomeBookingLink
        source="home_sticky_mobile"
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-base font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99]"
      >
        Book a Cleaning
      </HomeBookingLink>
    </div>
  );
}
