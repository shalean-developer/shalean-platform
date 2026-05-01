"use client";

import { useEffect, useState } from "react";
import type { AvailableCleanerDto } from "@/app/api/cleaners/available/route";
import { CheckoutCleanerCard } from "@/components/booking/checkout/CheckoutCleanerCard";
import { cn } from "@/lib/utils";

type CleanerStepProps = {
  cleanerId: string | null | undefined;
  onChange: (cleanerId: string | null) => void;
};

function normalizeCleaner(row: unknown): AvailableCleanerDto | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Cleaner";
  const rating = r.rating != null && Number.isFinite(Number(r.rating)) ? Number(r.rating) : 0;
  const jobs = r.jobs != null && Number.isFinite(Number(r.jobs)) ? Math.max(0, Math.floor(Number(r.jobs))) : 0;
  const recommendPct =
    r.recommendPct != null && Number.isFinite(Number(r.recommendPct))
      ? Math.min(100, Math.max(0, Math.round(Number(r.recommendPct))))
      : Math.min(100, Math.max(0, Math.round((rating / 5) * 100)));
  const image = typeof r.image === "string" && r.image.trim() ? r.image.trim() : null;
  return { id, name, rating, jobs, recommendPct, image };
}

export function CleanerStep({ cleanerId, onChange }: CleanerStepProps) {
  const auto = cleanerId == null || cleanerId === "";
  const [cleaners, setCleaners] = useState<AvailableCleanerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch("/api/cleaners/available");
        const json = (await res.json()) as { cleaners?: unknown[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setFetchError(typeof json.error === "string" ? json.error : "Could not load cleaners.");
          return;
        }
        const raw = Array.isArray(json.cleaners) ? json.cleaners : [];
        const next: AvailableCleanerDto[] = [];
        for (const row of raw) {
          const c = normalizeCleaner(row);
          if (c) next.push(c);
        }
        if (!cancelled) setCleaners(next);
      } catch {
        if (!cancelled) setFetchError("Network error loading cleaners.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
          auto
            ? "border-blue-600 bg-blue-50/80 ring-1 ring-blue-600/15 dark:border-blue-500 dark:bg-blue-950/40"
            : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
            auto ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-600" : "border-zinc-300 dark:border-zinc-600",
          )}
        >
          {auto ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
        </span>
        <span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">Best available</span>
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">Auto-match · same price</span>
        </span>
      </button>

      {fetchError ? <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p> : null}
      {loading ? <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading cleaners…</p> : null}

      <ul className="space-y-4">
        {cleaners.map((c) => (
          <li key={c.id}>
            <CheckoutCleanerCard
              cleaner={c}
              selected={cleanerId === c.id}
              onChoose={() => onChange(c.id)}
              profileHref="/services"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
