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
        "rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 sm:p-6",
        "hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none dark:hover:shadow-md dark:hover:shadow-zinc-950/40",
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
