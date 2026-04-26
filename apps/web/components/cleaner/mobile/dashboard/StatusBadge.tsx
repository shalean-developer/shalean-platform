"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeTone = "amber" | "emerald" | "sky";

const toneCls: Record<StatusBadgeTone, string> = {
  amber:
    "border-amber-300/90 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  emerald:
    "border-emerald-300/80 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
  sky: "border-sky-300/80 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
};

type Props = {
  children: ReactNode;
  tone: StatusBadgeTone;
  className?: string;
};

/** Uppercase availability / team status chip (e.g. NOT CONFIRMED YET). */
export function StatusBadge({ children, tone, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
        toneCls[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
