"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminCleanerRow } from "@/lib/admin/dashboard";

function metrics(c: AdminCleanerRow): string {
  const rating =
    typeof c.rating === "number" && Number.isFinite(c.rating) ? `⭐ ${c.rating.toFixed(1)}` : null;
  const jobs =
    typeof c.jobs_completed === "number" && c.jobs_completed >= 0 ? `${c.jobs_completed} jobs` : null;
  const avail = c.is_available === true ? "🟢 Active" : c.is_available === false ? "🔴 Inactive" : "⚪ Unknown";
  return [rating, jobs, avail].filter(Boolean).join(" · ");
}

export function CandidateRow({
  cleaner,
  selected,
  onToggleSelect,
  onQuickAdd,
  disabled,
  busy,
}: {
  cleaner: AdminCleanerRow;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onQuickAdd: (id: string) => void;
  disabled: boolean;
  busy: boolean;
}) {
  const name = cleaner.full_name?.trim() || "Unnamed cleaner";
  const phone = (cleaner.phone ?? "").trim();

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/60 sm:flex-row sm:items-center">
      <label className="flex cursor-pointer items-start gap-3 pt-0.5 sm:items-center">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-sky-600 focus:ring-sky-500 dark:border-zinc-600 sm:mt-0"
          checked={selected}
          onChange={() => onToggleSelect(cleaner.id)}
          aria-label={`Select ${name}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{name}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{phone || "No phone on file"}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{metrics(cleaner)}</p>
        </div>
      </label>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="shrink-0 rounded-lg sm:self-center"
        disabled={disabled || busy}
        onClick={() => onQuickAdd(cleaner.id)}
      >
        {busy ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            Adding…
          </>
        ) : (
          "Add"
        )}
      </Button>
    </li>
  );
}
