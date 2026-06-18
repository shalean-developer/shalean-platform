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
import { useCleanerNavBadges } from "@/components/cleaner-dashboard/CleanerNavBadgesContext";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match: (p: string) => boolean;
};

const NAV_LINKS: NavItem[] = [
  {
    href: "/jobs",
    label: "Home",
    icon: Home,
    match: (p) => p === "/jobs",
  },
  {
    href: "/jobs/list",
    label: "Jobs",
    icon: Briefcase,
    match: (p) => p === "/jobs/list" || p.startsWith("/jobs/job/"),
  },
  {
    href: "/jobs/earnings",
    label: "Earnings",
    icon: Wallet,
    match: (p) => p.startsWith("/jobs/earnings"),
  },
  {
    href: "/jobs/profile",
    label: "Profile",
    icon: CircleUserRound,
    match: (p) => p.startsWith("/jobs/profile"),
  },
];

export function JobsBottomNav() {
  const pathname = usePathname() ?? "";
  const { openJobsCount, pendingOffersCount } = useCleanerNavBadges();

  return (
    <nav
      aria-label="Jobs primary navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md shadow-[0_-1px_8px_rgba(0,0,0,0.06)]"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {NAV_LINKS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          const tabBadge = pickCleanerNavTabBadge({
            href,
            openJobsCount,
            pendingOffersCount,
          });
          const ariaLabel = cleanerNavTabAriaLabel(label, tabBadge);
          return (
            <Link
              key={href}
              href={href}
              aria-label={ariaLabel}
              className={cn(
                "relative flex min-h-[3.25rem] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium transition-all duration-200 active:scale-95",
                active
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-400 hover:text-slate-600",
              )}
            >
              <span className="relative inline-flex">
                <Icon
                  className={cn("size-5", active ? "text-blue-600" : "text-slate-400")}
                  aria-hidden
                  strokeWidth={active ? 2.25 : 1.75}
                />
                {tabBadge?.kind === "offers" ? (
                  <span
                    aria-hidden
                    className="absolute -right-2 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white shadow-sm"
                  >
                    {cleanerNavBadgeLabel(tabBadge.count)}
                  </span>
                ) : null}
              </span>
              <span className={cn("max-w-[4.5rem] truncate text-center text-[10px] tabular-nums leading-tight", active ? "font-semibold" : "font-medium")}>
                {tabBadge ? `${label} (${cleanerNavBadgeLabel(tabBadge.count)})` : label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
