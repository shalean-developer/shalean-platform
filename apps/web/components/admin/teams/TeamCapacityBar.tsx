"use client";

export function TeamCapacityBar({
  current,
  capacity,
}: {
  current: number;
  capacity: number;
}) {
  const cap = Math.max(1, capacity);
  const pct = Math.min(100, Math.round((current / cap) * 100));
  const left = Math.max(0, capacity - current);
  const over = current > capacity;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          <span className="tabular-nums">{current}</span>
          <span className="text-zinc-400"> / </span>
          <span className="tabular-nums">{capacity}</span>
          <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">members</span>
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {over ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">Over capacity</span>
          ) : left === 0 ? (
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Team is full</span>
          ) : (
            <span className="tabular-nums">
              {left} slot{left === 1 ? "" : "s"} left
            </span>
          )}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-label="Team capacity usage"
      >
        <div
          className={[
            "h-2 rounded-full transition-[width] duration-300",
            over ? "bg-amber-500" : pct >= 100 ? "bg-emerald-500" : "bg-sky-500",
          ].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
