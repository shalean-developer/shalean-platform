"use client";

import { CalendarDays, Home, UserRound, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export type CleanerMobileTab = "home" | "schedule" | "earnings" | "profile";

const tabs: { id: CleanerMobileTab; label: string; Icon: typeof Home }[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "schedule", label: "Schedule", Icon: CalendarDays },
  { id: "earnings", label: "Earnings", Icon: Wallet },
  { id: "profile", label: "Profile", Icon: UserRound },
];

export function CleanerBottomNav({
  active,
  onChange,
}: {
  active: CleanerMobileTab;
  onChange: (tab: CleanerMobileTab) => void;
}) {
  return (
    <nav
      className="flex shrink-0 items-stretch justify-around gap-1 border-t border-zinc-200 bg-white px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Cleaner app"
    >
      {tabs.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition-colors",
              isActive
                ? "text-blue-600 dark:text-blue-400"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            <Icon className={cn("h-5 w-5", isActive && "stroke-[2.25]")} aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
