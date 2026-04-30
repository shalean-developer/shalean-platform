"use client";

export function CleanerEarningsSmartInsights({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Insights</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No tips right now—you&apos;re all caught up.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Insights</p>
      <ul className="mt-2 space-y-2">
        {messages.map((m, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug text-zinc-700 dark:text-zinc-300">
            <span className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
              •
            </span>
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
