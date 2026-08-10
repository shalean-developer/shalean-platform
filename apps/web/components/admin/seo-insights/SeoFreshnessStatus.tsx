"use client";

import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SeoFreshnessState = "healthy" | "stale" | "failed";

export function resolveSeoFreshness(syncedAt: string | null, now = Date.now()): {
  state: SeoFreshnessState;
  ageHours: number | null;
  label: string;
  detail: string;
} {
  if (!syncedAt) {
    return {
      state: "failed",
      ageHours: null,
      label: "Failed",
      detail: "No successful GSC sync has been recorded yet.",
    };
  }

  const syncedMs = new Date(syncedAt).getTime();
  if (!Number.isFinite(syncedMs)) {
    return {
      state: "failed",
      ageHours: null,
      label: "Failed",
      detail: "The last successful GSC sync timestamp is invalid.",
    };
  }

  const ageHours = Math.max(0, (now - syncedMs) / 3_600_000);
  if (ageHours <= 36) {
    return {
      state: "healthy",
      ageHours,
      label: "Healthy",
      detail: "Search Console data is within the expected daily refresh window.",
    };
  }
  if (ageHours <= 72) {
    return {
      state: "stale",
      ageHours,
      label: "Stale",
      detail: "Search Console data is older than the expected daily refresh window.",
    };
  }
  return {
    state: "failed",
    ageHours,
    label: "Failed",
    detail: "No successful Search Console refresh has completed in more than 72 hours.",
  };
}

export function SeoFreshnessStatus({ syncedAt }: { syncedAt: string | null }) {
  const freshness = resolveSeoFreshness(syncedAt);
  const Icon = freshness.state === "healthy" ? CheckCircle2 : freshness.state === "stale" ? Clock3 : AlertCircle;
  const tone = freshness.state === "healthy"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : freshness.state === "stale"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3", tone)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">GSC data health: {freshness.label}</p>
          <p className="mt-0.5 text-xs opacity-90">{freshness.detail}</p>
        </div>
      </div>
      <div className="text-right text-xs">
        <p className="font-medium">Last successful sync</p>
        <p>{syncedAt ? new Date(syncedAt).toLocaleString("en-ZA") : "Never"}</p>
      </div>
    </div>
  );
}
