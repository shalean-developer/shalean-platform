"use client";

export type TimelineFields = {
  status: string | null;
  assigned_at?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

const STEPS: { label: string; at?: keyof TimelineFields }[] = [
  { label: "Cleaner assigned", at: "assigned_at" },
  { label: "On the way", at: "en_route_at" },
  { label: "Cleaning in progress", at: "started_at" },
  { label: "Completed", at: "completed_at" },
];

export function BookingTimeline({ fields }: { fields: TimelineFields }) {
  const st = (fields.status ?? "pending").toLowerCase();

  if (st === "cancelled" || st === "failed") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
        Status: <span className="font-semibold uppercase">{st}</span>
      </div>
    );
  }

  let doneCount = 0;
  if (st === "completed" || fields.completed_at) doneCount = 4;
  else if (st === "in_progress" || fields.started_at) doneCount = 3;
  else if (fields.en_route_at) doneCount = 2;
  else if (st === "assigned" || fields.assigned_at) doneCount = 1;
  else if (st === "pending") doneCount = 0;

  const pct = (doneCount / STEPS.length) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span>Visit progress</span>
        <span className="tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 dark:bg-emerald-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="space-y-2 text-sm">
        {STEPS.map((step, i) => {
          const reached = i < doneCount;
          const atKey = step.at;
          const at = atKey ? fields[atKey] : null;
          return (
            <li key={step.label} className="flex gap-3">
              <span
                className={[
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  reached
                    ? "bg-emerald-600 text-white dark:bg-emerald-500"
                    : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
                ].join(" ")}
              >
                {reached ? "✓" : i + 1}
              </span>
              <div>
                <p className={reached ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"}>
                  {step.label}
                </p>
                {at && typeof at === "string" ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(at).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
