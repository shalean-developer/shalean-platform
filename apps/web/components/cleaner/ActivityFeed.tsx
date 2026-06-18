"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ActivityFeedKind } from "@/hooks/useCleanerDashboardData";

type ActivityEntry = {
  id: string;
  text: string;
  /** ISO timestamp or ms — used for display if timeLabel is absent. */
  ts?: number;
  /** Pre-formatted time string (e.g. "10:15") from the dashboard hook. */
  timeLabel?: string;
  kind: ActivityFeedKind;
};

type ActivityFeedProps = {
  entries: ActivityEntry[];
  maxVisible?: number;
  className?: string;
};

function dotClass(kind: ActivityFeedKind): string {
  switch (kind) {
    case "success":
      return "bg-green-500";
    case "offer":
      return "bg-blue-500";
    case "warning":
      return "bg-amber-400";
    default:
      return "bg-slate-300";
  }
}

function formatActivityTime(entry: ActivityEntry): string {
  if (entry.timeLabel) return entry.timeLabel;
  if (!entry.ts) return "";
  try {
    const date = new Date(entry.ts);
    const diffDays = Math.floor((Date.now() - entry.ts) / 86_400_000);
    if (diffDays === 0) {
      return new Intl.DateTimeFormat("en-ZA", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Johannesburg",
      }).format(date);
    }
    if (diffDays === 1) return "Yesterday";
    return new Intl.DateTimeFormat("en-ZA", {
      month: "short",
      day: "numeric",
      timeZone: "Africa/Johannesburg",
    }).format(date);
  } catch {
    return "";
  }
}

export function ActivityFeed({
  entries,
  maxVisible = 5,
  className,
}: ActivityFeedProps) {
  if (entries.length === 0) return null;

  const visible = entries.slice(0, maxVisible);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Recent Activity
        </h2>
        {entries.length > maxVisible ? (
          <Link
            href="/jobs/list"
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            View all
          </Link>
        ) : null}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
        {visible.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
            <span
              aria-hidden
              className={cn(
                "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                dotClass(entry.kind),
              )}
            />
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <p className="text-sm text-slate-700 leading-snug">{entry.text}</p>
              <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                {formatActivityTime(entry)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
