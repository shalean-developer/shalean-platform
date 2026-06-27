"use client";

import { CheckCircle2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type AvailabilityStatus = "online" | "offline" | "off-today";

type ProfileSummaryCardProps = {
  name: string;
  initials: string;
  rating?: string | null;
  completedJobs?: number | null;
  availabilityStatus: AvailabilityStatus;
  className?: string;
};

function statusLabel(status: AvailabilityStatus): { text: string; color: string } {
  switch (status) {
    case "online":
      return { text: "Online • Available for jobs", color: "text-green-600" };
    case "offline":
      return { text: "Offline", color: "text-slate-400" };
    case "off-today":
      return { text: "Off today", color: "text-slate-400" };
  }
}

export function ProfileSummaryCard({
  name,
  initials,
  rating,
  completedJobs,
  availabilityStatus,
  className,
}: ProfileSummaryCardProps) {
  const status = statusLabel(availabilityStatus);

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-sm">
          {initials}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">{name}</h1>
          <p className={cn("mt-0.5 text-sm font-medium", status.color)}>{status.text}</p>
          <div className="mt-2 flex items-center gap-3">
            {rating ? (
              <div className="flex items-center gap-1">
                <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                <span className="text-sm font-semibold tabular-nums text-slate-700">
                  {rating}
                </span>
              </div>
            ) : null}
            {completedJobs != null ? (
              <div className="flex items-center gap-1">
                <CheckCircle2 className="size-3.5 text-green-500" aria-hidden />
                <span className="text-sm text-slate-500">
                  {completedJobs} jobs
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
