"use client";

import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "";
    const b = parts[parts.length - 1]![0] ?? "";
    return `${a}${b}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export type CleanerHeaderProfile = {
  displayName: string;
  isAvailable: boolean;
  showNotificationDot?: boolean;
};

type Props = {
  profile: CleanerHeaderProfile;
  /** Screen reader / fallback page title. */
  srTitle: string;
  onBellClick?: () => void;
};

export function CleanerHeader({ profile, srTitle, onBellClick }: Props) {
  const initials = initialsFromName(profile.displayName);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold tracking-tight text-white shadow-md shadow-blue-900/15 dark:bg-blue-500"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-zinc-900 dark:text-zinc-50">{profile.displayName}</p>
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">Shalean Cleaner</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
            profile.isAvailable
              ? "border-emerald-200/90 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/40"
              : "border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/80",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              profile.isAvailable ? "bg-emerald-600 dark:bg-emerald-400" : "bg-zinc-400 dark:bg-zinc-500",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "text-[10px] font-bold leading-none sm:text-[11px]",
              profile.isAvailable
                ? "text-emerald-800 dark:text-emerald-100"
                : "text-zinc-600 dark:text-zinc-300",
            )}
          >
            {profile.isAvailable ? (
              <>
                <span className="sm:hidden">Active</span>
                <span className="hidden sm:inline">Active &amp; Available</span>
              </>
            ) : (
              <>
                <span className="sm:hidden">Off</span>
                <span className="hidden sm:inline">Unavailable</span>
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          aria-label="Notifications"
          onClick={() => onBellClick?.()}
        >
          <Bell className="h-5 w-5" strokeWidth={2} aria-hidden />
          {profile.showNotificationDot ? (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-slate-100 dark:ring-zinc-800" />
          ) : null}
        </button>
      </div>
      <span className="sr-only">{srTitle}</span>
    </div>
  );
}
