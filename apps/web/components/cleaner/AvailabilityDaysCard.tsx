import {
  CLEANER_WEEKDAY_CODES,
  CLEANER_WEEKDAY_LABELS,
  type CleanerWeekdayCode,
} from "@/lib/cleaner/availabilityWeekdays";

export default function AvailabilityDaysCard({ activeDays }: { activeDays: CleanerWeekdayCode[] }) {
  const active = new Set(activeDays);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Availability days</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Set by admin only. To add or remove a day, contact support.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Weekdays you may be scheduled">
        {CLEANER_WEEKDAY_CODES.map((code) => {
          const on = active.has(code);
          return (
            <li
              key={code}
              className={
                on
                  ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : "rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-400 line-through dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-500"
              }
            >
              {CLEANER_WEEKDAY_LABELS[code]}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
