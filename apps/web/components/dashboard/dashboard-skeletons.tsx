"use client";

import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-zinc-200/90 dark:bg-zinc-800", className)} />;
}

export function DashboardPageSkeleton() {
  return (
    <div className="min-h-dvh bg-zinc-50 pb-20 md:pb-0 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <Bar className="h-5 w-28" />
      </div>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <Bar className="h-8 w-48" />
          <Bar className="h-4 w-full max-w-md" />
        </div>
        <Bar className="h-40 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Bar className="h-32 w-full rounded-2xl" />
          <Bar className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function DashboardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i}>
          <Bar className="h-36 w-full rounded-2xl" />
        </li>
      ))}
    </ul>
  );
}
