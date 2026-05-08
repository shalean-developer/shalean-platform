"use client";

import Image from "next/image";
import { Star } from "lucide-react";
import type { AvailableCleanerDto } from "@/app/api/cleaners/available/route";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const topRatedCopy = bookingCopy.checkoutCleaner.topRatedLine;

function initials(name: string): string {
  const parts = name.replace(/\./g, "").split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function ratingOneDecimal(r: number): string {
  if (!Number.isFinite(r) || r <= 0) return "—";
  return (Math.round(r * 10) / 10).toFixed(1);
}

type CheckoutCleanerCardProps = {
  cleaner: AvailableCleanerDto;
  selected: boolean;
  onChoose: () => void;
};

export function CheckoutCleanerCard({ cleaner, selected, onChoose }: CheckoutCleanerCardProps) {
  const hasPhoto = Boolean(cleaner.image?.trim());
  const topRated = cleaner.rating >= 4.8 && cleaner.jobs >= 40;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white transition-all duration-200 dark:bg-zinc-950",
        selected
          ? "border-blue-600 shadow-[0_0_0_1px_rgba(37,99,235,0.35)] ring-2 ring-blue-500/20 dark:border-blue-500"
          : "border-zinc-200/95 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600",
      )}
    >
      <button
        type="button"
        onClick={onChoose}
        className="flex w-full min-h-[52px] items-center gap-3 px-3 py-3 text-left active:bg-zinc-50/80 dark:active:bg-zinc-900/50 sm:min-h-0 sm:gap-4 sm:px-4 sm:py-3.5"
        aria-pressed={selected}
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:ring-zinc-700">
          {hasPhoto ? (
            <Image
              src={cleaner.image!}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">
              {initials(cleaner.name)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{cleaner.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
              {ratingOneDecimal(cleaner.rating)}
            </span>
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
              ·
            </span>
            <span className="tabular-nums">{cleaner.jobs} jobs</span>
          </p>
          {topRated ? (
            <p className="mt-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-500">{topRatedCopy}</p>
          ) : null}
        </div>

        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected
              ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-600"
              : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900",
          )}
          aria-hidden
        >
          {selected ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
        </span>
      </button>
    </div>
  );
}
