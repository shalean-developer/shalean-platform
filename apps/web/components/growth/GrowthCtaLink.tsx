"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

export function GrowthCtaLink({
  href,
  className,
  children,
  source,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  source: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackGrowthEvent("start_booking", { source })}
    >
      {children}
    </Link>
  );
}
