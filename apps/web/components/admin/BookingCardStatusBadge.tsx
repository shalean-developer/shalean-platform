"use client";

/** Normalize DB status for pill label + color key (assigned → confirmed wording). */
function normalizeStatusKey(status: string | null): string {
  const s = (status ?? "pending").toLowerCase();
  if (s === "assigned") return "confirmed";
  return s;
}

const STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  in_progress: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  completed: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  issue: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  cancelled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  failed: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  payment_expired: "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200",
};

function humanLabel(key: string): string {
  if (key === "confirmed") return "Confirmed";
  return key.replace(/_/g, " ");
}

/**
 * Workflow status pill for admin booking cards (maps `assigned` → confirmed styling).
 */
export function BookingCardStatusBadge({ status }: { status: string | null }) {
  const key = normalizeStatusKey(status);
  const cls = STYLE[key] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  return (
    <span className={["inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize", cls].join(" ")}>
      {humanLabel(key)}
    </span>
  );
}
