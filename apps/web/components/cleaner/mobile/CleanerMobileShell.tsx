"use client";

import type { ReactNode } from "react";
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
  contentClassName,
}: {
  title: string;
  children: ReactNode;
  activeTab: CleanerMobileTab;
  onTabChange: (tab: CleanerMobileTab) => void;
  alert?: ReactNode;
  headerProfile?: CleanerHeaderProfile | null;
  onBellClick?: () => void;
  /** Scrollable main padding (default p-4). */
  contentClassName?: string;
}) {
  return (
    <div className="flex h-[100dvh] flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {headerProfile ? (
          <CleanerHeader profile={headerProfile} srTitle={title} onBellClick={onBellClick} />
        ) : (
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Shalean cleaner</p>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
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
