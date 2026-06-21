"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GET_FREE_QUOTE_HREF, getFreeQuoteButtonClass } from "@/lib/marketing/getFreeQuote";
import { cn } from "@/lib/utils";

type Variant = keyof typeof getFreeQuoteButtonClass;

export function GetFreeQuoteLink({
  source,
  variant = "outline",
  className,
  children = "Get Free Quote",
}: {
  source: string;
  variant?: Variant;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={GET_FREE_QUOTE_HREF}
      data-quote-cta-source={source}
      className={cn(getFreeQuoteButtonClass[variant], className)}
    >
      {children}
    </Link>
  );
}
