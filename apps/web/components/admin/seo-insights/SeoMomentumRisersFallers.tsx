"use client";

import Link from "next/link";
import { SeoInsightsEmptyState } from "@/components/admin/seo-insights/SeoInsightsEmptyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SeoMomentumMoverRow } from "@/lib/seo/compute-seo-momentum-movers";
import { cn } from "@/lib/utils";

function Column({
  title,
  tone,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  tone: "up" | "down";
  rows: SeoMomentumMoverRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 p-4 dark:border-zinc-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</p>
        <div className="mt-3">
          <SeoInsightsEmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-wide",
          tone === "up" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300",
        )}
      >
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li
            key={r.slug}
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-zinc-100 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40"
          >
            <div className="min-w-0">
              <div className="font-semibold text-zinc-900 dark:text-zinc-50">{r.label}</div>
              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{r.signalLine}</div>
            </div>
            <Link
              href={r.hubHref}
              className="shrink-0 text-xs font-semibold text-blue-700 underline-offset-4 hover:underline dark:text-blue-400"
            >
              Hub
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Largest directional wins vs losses (current 30d vs prior 30d). */
export function SeoMomentumRisersFallers({
  risers,
  fallers,
}: {
  risers: SeoMomentumMoverRow[];
  fallers: SeoMomentumMoverRow[];
}) {
  const hasAny = risers.length > 0 || fallers.length > 0;

  if (!hasAny) {
    return (
      <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Risers & fallers</CardTitle>
          <CardDescription>
          Directional movement vs the prior 30 days (non-overlapping). Low-magnitude noise is excluded.
        </CardDescription>
        </CardHeader>
        <CardContent>
          <SeoInsightsEmptyState
            title="No directional movement yet"
            description="Once hubs diverge between the two windows, improving and declining suburbs surface here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
      <CardHeader>
        <CardTitle className="text-base">Risers & fallers</CardTitle>
        <CardDescription>
          Biggest improving vs deteriorating hubs (health, booking-start proxy, scroll %→100) vs prior 30d. Only suburbs
          with enough combined movement to be operationally meaningful are shown—tiny noise is filtered out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-8 sm:grid-cols-2">
          <Column
            title="Risers"
            tone="up"
            rows={risers}
            emptyTitle="No clear risers"
            emptyDescription="No suburb showed a net-positive trajectory across the sampled signals."
          />
          <Column
            title="Fallers"
            tone="down"
            rows={fallers}
            emptyTitle="No clear fallers"
            emptyDescription="No suburb showed a net-negative trajectory across the sampled signals."
          />
        </div>
      </CardContent>
    </Card>
  );
}
