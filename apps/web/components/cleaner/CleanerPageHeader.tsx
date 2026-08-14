"use client";

import { useEffect, useState } from "react";
import { Award, Bell, Star } from "lucide-react";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { cn } from "@/lib/utils";

type CleanerPageHeaderProps = {
  firstName: string;
  subline?: string;
  ratingDisplay?: string | null;
  /** Legacy fallback only. Canonical performance is loaded from /api/cleaner/performance. */
  reliabilityDisplay?: string | null;
  notificationCount?: number;
  onNotificationClick?: () => void;
  className?: string;
};

type CleanerPerformanceResponse = {
  scorecard?: {
    overallScore: number | null;
    grade: "A" | "B" | "C" | "D" | "Needs evidence";
  } | null;
};

export function CleanerPageHeader({
  firstName,
  subline,
  ratingDisplay,
  reliabilityDisplay,
  notificationCount = 0,
  onNotificationClick,
  className,
}: CleanerPageHeaderProps) {
  const [canonicalPerformance, setCanonicalPerformance] = useState<CleanerPerformanceResponse["scorecard"]>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const headers = await getCleanerAuthHeaders();
      if (!headers) return;

      const response = await cleanerAuthenticatedFetch("/api/cleaner/performance?days=90", {
        headers,
        cache: "no-store",
      });
      if (!response.ok) return;

      const body = (await response.json().catch(() => null)) as CleanerPerformanceResponse | null;
      if (!cancelled) setCanonicalPerformance(body?.scorecard ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const canonicalPerformanceDisplay =
    canonicalPerformance?.overallScore == null
      ? null
      : `${Math.round(canonicalPerformance.overallScore)}% · Grade ${canonicalPerformance.grade}`;
  const performanceDisplay = canonicalPerformanceDisplay ?? reliabilityDisplay;
  const showPerformance = Boolean(ratingDisplay || performanceDisplay);

  return (
    <div className={cn("flex items-start justify-between pt-4 pb-2", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Hi, {firstName} {"\u{1F44B}"}
        </h1>
        {showPerformance ? (
          <div className="mt-1 flex items-center gap-3 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1" title="Customer rating">
              <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
              <span>{ratingDisplay ?? "—"}</span>
            </span>
            <span className="inline-flex items-center gap-1" title="Official 90-day performance score used by Office">
              <Award className="size-4 text-blue-600" aria-hidden />
              <span>{performanceDisplay ?? "—"}</span>
            </span>
          </div>
        ) : subline ? (
          <p className="mt-0.5 text-sm text-slate-400">{subline}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onNotificationClick}
        aria-label={
          notificationCount > 0
            ? `${notificationCount} unread notifications`
            : "Notifications"
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm transition-colors active:bg-gray-50"
      >
        <Bell className="size-5 text-slate-600" strokeWidth={1.75} aria-hidden />
        {notificationCount > 0 ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-bold leading-none text-white"
          >
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
