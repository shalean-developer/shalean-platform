import { cn } from "@/lib/utils";

export type SeoKpiStatus = "good" | "neutral" | "warn" | "bad";

const statusRing: Record<SeoKpiStatus, string> = {
  good: "border-emerald-200/90 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/30",
  neutral: "border-blue-200/90 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/25",
  warn: "border-amber-200/90 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/25",
  bad: "border-rose-200/90 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/25",
};

type Props = {
  title: string;
  value: string;
  subtitle?: string;
  status?: SeoKpiStatus;
  className?: string;
};

/** Compact executive KPI tile for SEO command center. */
export function SeoInsightsKpiCard({ title, value, subtitle, status = "neutral", className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-sm transition hover:shadow-md",
        statusRing[status],
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{value}</p>
      {subtitle ? <p className="mt-1 text-xs leading-snug text-zinc-600 dark:text-zinc-400">{subtitle}</p> : null}
    </div>
  );
}

export function scoreToKpiStatus(score: number): SeoKpiStatus {
  if (score >= 80) return "good";
  if (score >= 60) return "neutral";
  if (score >= 40) return "warn";
  return "bad";
}
