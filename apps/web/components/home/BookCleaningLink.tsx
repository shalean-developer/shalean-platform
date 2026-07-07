"use client";

import { HomeBookingLink } from "@/components/home/HomeBookingLink";
import type { ReactNode } from "react";

export function BookCleaningLink({
  children,
  className,
  source,
}: {
  children: ReactNode;
  className?: string;
  source: string;
}) {
  return <HomeBookingLink source={source} className={className}>{children}</HomeBookingLink>;
}
