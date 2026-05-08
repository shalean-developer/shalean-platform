"use client";

import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AvailableCleanerDto } from "@/app/api/cleaners/available/route";
import { CheckoutCleanerCard } from "@/components/booking/checkout/CheckoutCleanerCard";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const copy = bookingCopy.checkoutCleaner;

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
  const [browseOpen, setBrowseOpen] = useState(() => !auto);
  const [cleaners, setCleaners] = useState<AvailableCleanerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!auto) setBrowseOpen(true);
  }, [auto]);

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

  const selectAuto = useCallback(() => {
    onChange(null);
    setBrowseOpen(false);
  }, [onChange]);

  const toggleBrowse = useCallback(() => {
    setBrowseOpen((o) => !o);
  }, []);

  return (
    <div className="space-y-3 sm:space-y-4">
      <button
        type="button"
        onClick={selectAuto}
        className={cn(
          "relative flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:gap-4 sm:p-5",
          auto
            ? "border-blue-600 bg-gradient-to-br from-blue-50/95 via-white to-white ring-2 ring-blue-600/15 dark:border-blue-500 dark:from-blue-950/35 dark:via-zinc-950 dark:to-zinc-950 dark:ring-blue-500/20"
            : "border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors sm:h-6 sm:w-6",
            auto ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-600" : "border-zinc-300 dark:border-zinc-600",
          )}
          aria-hidden
        >
          {auto ? <span className="h-2 w-2 rounded-full bg-white sm:h-2.5 sm:w-2.5" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50 sm:text-base">
              {copy.bestAvailableTitle}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/90 dark:bg-emerald-950/50 dark:text-emerald-100 dark:ring-emerald-800/80">
              {copy.recommendedBadge}
            </span>
          </span>
          <span className="mt-1.5 block text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {copy.bestAvailableBody}
          </span>
        </span>
      </button>

      <div
        className={cn(
          "rounded-xl border bg-white shadow-sm dark:bg-zinc-950",
          !auto ? "border-zinc-300 dark:border-zinc-600" : "border-zinc-200/90 dark:border-zinc-800",
        )}
      >
        <button
          type="button"
          onClick={toggleBrowse}
          className="flex w-full min-h-[52px] items-center gap-3 px-3.5 py-3 text-left transition hover:bg-zinc-50/90 dark:hover:bg-zinc-900/60 sm:min-h-[56px] sm:gap-4 sm:px-4 sm:py-3.5"
          aria-expanded={browseOpen}
        >
          <span
            className={cn(
              "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 sm:h-6 sm:w-6",
              !auto
                ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-600"
                : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900",
            )}
            aria-hidden
          >
            {!auto ? <span className="h-2 w-2 rounded-full bg-white sm:h-2.5 sm:w-2.5" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-zinc-900 dark:text-zinc-50 sm:text-base">
              {copy.manualTitle}
            </span>
            <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400 sm:hidden">{copy.manualSubtitleMobile}</span>
            <span className="mt-0.5 hidden text-sm text-zinc-500 dark:text-zinc-400 sm:block">
              {copy.manualSubtitleDesktop}
            </span>
          </span>
          <ChevronRight
            className={cn(
              "h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 dark:text-zinc-500",
              browseOpen && "rotate-90",
            )}
            aria-hidden
          />
        </button>

        {browseOpen ? (
          <div className="space-y-3 border-t border-zinc-100 px-3 pb-3 pt-3 dark:border-zinc-800 sm:px-4 sm:pb-4">
            {fetchError ? <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p> : null}
            {loading ? (
              <div className="space-y-2">
                <div className="h-[4.25rem] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-[4.25rem] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
              </div>
            ) : null}
            {!loading && cleaners.length === 0 && !fetchError ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No cleaners to show — {copy.bestAvailableTitle.toLowerCase()} is recommended.
              </p>
            ) : null}
            <ul className="space-y-2.5">
              {cleaners.map((c) => (
                <li key={c.id}>
                  <CheckoutCleanerCard cleaner={c} selected={cleanerId === c.id} onChoose={() => onChange(c.id)} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
