"use client";

import { CalendarDays } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingMobileHeaderBookIconClass } from "@/lib/marketing/marketingMobileLayout";

type Props = {
  bookingHref: string;
  source: string;
};

/** Icon-only book button — keeps the mobile header row uncluttered. */
export function MarketingMobileHeaderBookButton({ bookingHref, source }: Props) {
  return (
    <GrowthCtaLink href={bookingHref} source={source} className={marketingMobileHeaderBookIconClass}>
      <CalendarDays className="h-5 w-5" aria-hidden />
      <span className="sr-only">Book now</span>
    </GrowthCtaLink>
  );
}
