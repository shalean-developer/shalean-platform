"use client";

import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type DetailRowProps = {
  label: string;
  value: string;
  editHref: string;
  editLabel?: string;
  className?: string;
};

export function DetailRow({ label, value, editHref, editLabel, className }: DetailRowProps) {
  const aria = editLabel ?? `Edit ${label.toLowerCase()}`;
  return (
    <Link
      href={editHref}
      aria-label={aria}
      className={cn(
        "group flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-zinc-800/80",
        className,
      )}
    >
      <span className="min-w-0 text-sm text-gray-700 dark:text-zinc-300">
        <span className="font-medium text-gray-900 dark:text-zinc-100">{label}:</span>{" "}
        <span className="break-words">{value}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-gray-400 transition-opacity duration-200 group-hover:opacity-100 dark:text-zinc-500">
        <Pencil className="h-4 w-4 opacity-70 transition-opacity group-hover:opacity-100" aria-hidden />
        <ChevronRight className="h-4 w-4 opacity-50 group-hover:opacity-90" aria-hidden />
      </span>
    </Link>
  );
}
