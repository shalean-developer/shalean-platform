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
        "w-full rounded-2xl border border-transparent bg-transparent p-4 shadow-none transition-all duration-200 sm:border-gray-100 sm:bg-white sm:p-5 sm:shadow-sm sm:hover:shadow-md md:p-6",
        "dark:border-transparent dark:bg-transparent dark:shadow-none sm:dark:border-zinc-800 sm:dark:bg-zinc-900 sm:dark:shadow-none sm:dark:hover:shadow-md sm:dark:hover:shadow-zinc-950/40",
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
