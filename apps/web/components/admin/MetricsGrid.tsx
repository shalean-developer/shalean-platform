"use client";

type MetricItem = {
  label: string;
  value: string;
  hint?: string;
};

export default function MetricsGrid({ items }: { items: MetricItem[] }) {
  const isCleanerRosterGrid =
    items.some((item) => item.label === "Total cleaners") &&
    items.some((item) => item.label === "Available now");

  const displayItems = isCleanerRosterGrid
    ? items.map((item) => (item.label === "Active today" ? { ...item, label: "Active cleaners" } : item))
    : items;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {displayItems.map((item) => (
        <article key={item.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{item.value}</p>
          {item.hint ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.hint}</p> : null}
        </article>
      ))}
    </section>
  );
}
