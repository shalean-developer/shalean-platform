"use client";

import Link from "next/link";
import { MARKETING_HUB_NAV } from "@/lib/promotions/marketingUx";
import { cn } from "@/lib/utils";

export function MarketingSubNav({
  active,
}: {
  active:
    | "campaigns"
    | "social"
    | "email"
    | "landing"
    | "analytics"
    | "templates"
    | "assets"
    | "connected-accounts"
    | "intelligence";
}) {
  return (
    <nav className="flex flex-wrap gap-2 text-xs" aria-label="Marketing sections">
      {MARKETING_HUB_NAV.map((item) => (
        <Link
          key={item.href}
          href={`/office/marketing/${item.href}`}
          aria-current={active === item.match ? "page" : undefined}
          className={cn(
            "min-h-8 rounded-full border px-3 py-1.5",
            active === item.match
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
