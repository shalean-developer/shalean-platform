"use client";

import type { ReactNode } from "react";
import { Bell } from "lucide-react";
import { CleanerBottomNav, type CleanerMobileTab } from "@/components/cleaner/mobile/CleanerBottomNav";
import { CleanerHeader, type CleanerHeaderProfile } from "@/components/cleaner/mobile/dashboard/CleanerHeader";
import { cn } from "@/lib/utils";

export type CleanerShellHeaderProfile = CleanerHeaderProfile;

export function CleanerMobileShell({
  title,
  children,
  activeTab,
  onTabChange,
  alert,
  headerProfile,
  onBellClick,
  simpleHeaderBell,
  contentClassName,
}: {
  title: string;
  children: ReactNode;
  activeTab: CleanerMobileTab;
  onTabChange: (tab: CleanerMobileTab) => void;
  alert?: ReactNode;
  headerProfile?: CleanerHeaderProfile | null;
  onBellClick?: () => void;
  /** When `headerProfile` is null, optional bell (e.g. Profile tab). */
  simpleHeaderBell?: { showDot?: boolean; onClick: () => void };
  /** Scrollable main padding (default p-4). */
  contentClassName?: string;
}) {
  return (
    <div className="flex h-[100dvh] flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {headerProfile ? (
          <CleanerHeader profile={headerProfile} srTitle={title} onBellClick={onBellClick} />
        ) : (
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Shalean cleaner</p>
              <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
            </div>
            {simpleHeaderBell ? (
              <button
                type="button"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 sm:h-10 sm:w-10"
                aria-label="Notifications"
                onClick={() => simpleHeaderBell.onClick()}
              >
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} aria-hidden />
                {simpleHeaderBell.showDot ? (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-slate-100 dark:ring-zinc-800" />
                ) : null}
              </button>
            ) : null}
          </div>
        )}
      </header>

      {alert ? (
        <div className="shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">{alert}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn(contentClassName ?? "p-4")}>{children}</div>
      </div>

      <CleanerBottomNav active={activeTab} onChange={onTabChange} />
    </div>
  );
}
