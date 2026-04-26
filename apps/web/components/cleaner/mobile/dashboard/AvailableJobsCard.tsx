"use client";

import type { ReactNode } from "react";
import { Briefcase } from "lucide-react";

type Props = {
  /** When null, shows empty state inside the card. */
  children?: ReactNode;
};

export function AvailableJobsCard({ children }: Props) {
  return (
    <section className="space-y-2" aria-label="Available jobs">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">Available jobs</p>
      {children ? (
        <div>{children}</div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800">
            <Briefcase className="h-6 w-6 text-gray-300 dark:text-zinc-500" aria-hidden />
          </div>
          <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">No available jobs right now</p>
          <p className="mt-2 space-y-0 text-xs leading-relaxed text-gray-500 dark:text-zinc-400">
            We&apos;ll notify you when new work is available.
          </p>
        </div>
      )}
    </section>
  );
}

export function MyJobsSectionLabel() {
  return (
    <h2 className="mb-2 mt-1 px-0 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
      My jobs
    </h2>
  );
}
