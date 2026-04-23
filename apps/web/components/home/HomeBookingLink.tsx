"use client";

import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const bookingHref = "/booking?step=entry";

export function HomeBookingLink({
  children,
  className,
  source,
}: {
  children: ReactNode;
  className?: string;
  source: string;
}) {
  return (
    <GrowthCtaLink href={bookingHref} source={source} className={cn("inline-flex items-center justify-center text-center transition", className)}>
      {children}
    </GrowthCtaLink>
  );
}
