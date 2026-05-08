"use client";

import { cn } from "@/lib/utils";

export type BookingSectionCardProps = {
  /** Small uppercase section label (e.g. "Service") */
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Card wrapper for booking step blocks — matches premium checkout rhythm.
 */
export function BookingSectionCard({ eyebrow, children, className }: BookingSectionCardProps) {
  return (
    <section
      className={cn(
        "w-full rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm shadow-zinc-900/[0.04] transition-shadow duration-200 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/20",
        className,
      )}
    >
      {eyebrow ? (
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">{eyebrow}</h2>
      ) : null}
      {children}
    </section>
  );
}
