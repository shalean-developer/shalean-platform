import Link from "next/link";
import type { ReactNode } from "react";

export default function CleanerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shalean cleaner</p>
          <nav className="flex gap-4 text-sm font-medium">
            <Link href="/cleaner/dashboard" className="text-emerald-700 dark:text-emerald-400">
              Dashboard
            </Link>
            <Link href="/cleaner/jobs" className="text-emerald-700 dark:text-emerald-400">
              Jobs
            </Link>
            <Link href="/" className="text-zinc-600 dark:text-zinc-400">
              Site
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
