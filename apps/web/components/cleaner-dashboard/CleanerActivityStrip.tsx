import type { ActivityFeedKind } from "@/hooks/useCleanerDashboardData";
import { AlertTriangle, Bell, CheckCircle2, Info } from "lucide-react";

type ActivityEntry = { id: string; text: string; timeLabel: string; kind: ActivityFeedKind };

function ActivityIcon({ kind }: { kind: ActivityFeedKind }) {
  const common = "mt-0.5 size-4 shrink-0";
  switch (kind) {
    case "warning":
      return <AlertTriangle className={`${common} text-amber-600 dark:text-amber-400`} aria-hidden />;
    case "offer":
      return <Bell className={`${common} text-sky-600 dark:text-sky-400`} aria-hidden />;
    case "info":
      return <Info className={`${common} text-muted-foreground`} aria-hidden />;
    default:
      return <CheckCircle2 className={`${common} text-emerald-600 dark:text-emerald-400`} aria-hidden />;
  }
}

/** Chronological “today” feed — state-driven events (capped upstream). */
export function CleanerActivityStrip({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <section aria-label="Activity" className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
        <p className="mt-1 text-sm text-muted-foreground">Availability and offer updates will appear here as they happen.</p>
      </section>
    );
  }
  return (
    <section aria-label="Activity" className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
      <ul className="mt-1.5 space-y-2">
        {entries.map((it) => (
          <li key={it.id} className="flex gap-2 text-sm text-foreground/90">
            <ActivityIcon kind={it.kind} />
            <span className="shrink-0 tabular-nums text-[11px] font-medium text-muted-foreground">{it.timeLabel}</span>
            <span className="min-w-0 flex-1 leading-snug">{it.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
