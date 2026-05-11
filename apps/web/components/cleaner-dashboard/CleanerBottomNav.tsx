"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CircleUserRound, Home, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cleanerNavBadgeLabel,
  cleanerNavTabAriaLabel,
  pickCleanerNavTabBadge,
} from "@/lib/cleaner-dashboard/cleanerNavBadgeRendering";
import { useCleanerNavBadges } from "./CleanerNavBadgesContext";

const links = [
  { href: "/cleaner/dashboard", label: "Home", icon: Home, match: (p: string) => p === "/cleaner/dashboard" || p === "/cleaner" },
  { href: "/cleaner/jobs", label: "Jobs", icon: Briefcase, match: (p: string) => p === "/cleaner/jobs" || p.startsWith("/cleaner/jobs/") },
  { href: "/cleaner/earnings", label: "Earnings", icon: Wallet, match: (p: string) => p.startsWith("/cleaner/earnings") },
  { href: "/cleaner/profile", label: "Profile", icon: CircleUserRound, match: (p: string) => p.startsWith("/cleaner/profile") },
] as const;

export function CleanerBottomNav() {
  const pathname = usePathname() ?? "";
  const { openJobsCount, pendingOffersCount } = useCleanerNavBadges();

  return (
    <nav
      aria-label="Cleaner primary"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/90"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {links.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          const tabBadge = pickCleanerNavTabBadge({ href, openJobsCount, pendingOffersCount });
          const navLabel = tabBadge ? `${label} (${cleanerNavBadgeLabel(tabBadge.count)})` : label;
          const ariaLabel = cleanerNavTabAriaLabel(label, tabBadge);
          return (
            <Link
              key={href}
              href={href}
              aria-label={ariaLabel}
              className={cn(
                "relative flex min-h-12 min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium transition-colors duration-200 active:scale-95",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative inline-flex">
                <Icon className={cn("size-5", active && "text-primary")} aria-hidden />
                {tabBadge?.kind === "offers" ? (
                  <span
                    aria-hidden
                    className="absolute -right-2 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold leading-none text-white shadow-sm"
                  >
                    {cleanerNavBadgeLabel(tabBadge.count)}
                  </span>
                ) : null}
              </span>
              <span className="max-w-[4.5rem] truncate text-center tabular-nums leading-tight">{navLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
