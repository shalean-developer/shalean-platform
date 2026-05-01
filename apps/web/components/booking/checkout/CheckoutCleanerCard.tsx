"use client";

import Image from "next/image";
import Link from "next/link";
import { ThumbsUp } from "lucide-react";
import type { AvailableCleanerDto } from "@/app/api/cleaners/available/route";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.replace(/\./g, "").split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

type CheckoutCleanerCardProps = {
  cleaner: AvailableCleanerDto;
  selected: boolean;
  onChoose: () => void;
  /** e.g. `/services` or a future public profile path */
  profileHref: string;
};

export function CheckoutCleanerCard({ cleaner, selected, onChoose, profileHref }: CheckoutCleanerCardProps) {
  const hasPhoto = Boolean(cleaner.image?.trim());

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 dark:border-zinc-700 dark:bg-zinc-900",
        selected ? "border-blue-500 ring-2 ring-blue-500/25 dark:border-blue-500" : "border-gray-200 dark:border-zinc-700",
      )}
    >
      <div className="flex items-center gap-4 p-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
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
            <span className="flex h-12 w-12 items-center justify-center text-sm font-semibold text-zinc-600 dark:text-zinc-200">
              {initials(cleaner.name)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-zinc-50">{cleaner.name}</p>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400">
            <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
            <span>{cleaner.recommendPct}% Recommend</span>
          </div>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-zinc-400">
            <span className="font-semibold text-gray-900 dark:text-zinc-200">{cleaner.jobs}</span> Jobs Completed
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-zinc-700" />

      <div className="grid grid-cols-2 divide-x divide-gray-200 text-center text-sm font-medium dark:divide-zinc-700">
        <Link
          href={profileHref}
          className="block py-3 text-blue-600 transition-colors duration-200 hover:bg-gray-50 dark:text-blue-400 dark:hover:bg-zinc-800/80"
        >
          View profile
        </Link>
        <button
          type="button"
          onClick={onChoose}
          className="py-3 text-blue-600 transition-colors duration-200 hover:bg-gray-50 dark:text-blue-400 dark:hover:bg-zinc-800/80"
        >
          Choose me
        </button>
      </div>
    </div>
  );
}
