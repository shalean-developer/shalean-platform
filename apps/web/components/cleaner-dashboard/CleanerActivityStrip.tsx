import type { ActivityFeedKind } from "@/hooks/useCleanerDashboardData";
import { cn } from "@/lib/utils";

type ActivityEntry = { id: string; text: string; timeLabel: string; kind: ActivityFeedKind };

function dotClass(kind: ActivityFeedKind): string {
  switch (kind) {
    case "warning":
      return "bg-amber-500";
    case "offer":
      return "bg-sky-500";
    case "info":
      return "bg-muted-foreground/60";
    default:
      return "bg-emerald-500";
  }
}

/**
 * Tiny chronological "today" feed — terminal/log-style ticker.
 *
 * Each row is a single muted line: `19:58 • text`. Hidden entirely when
 * there are no entries — operational dashboards should not advertise
 * "nothing happened yet" with a dedicated empty card.
 */
export function CleanerActivityStrip({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section aria-label="Activity" className="px-0.5">
      <ul className="space-y-0.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {entries.map((it) => (
          <li key={it.id} className="flex items-center gap-2 truncate">
            <span className={cn("size-1.5 shrink-0 rounded-full", dotClass(it.kind))} aria-hidden />
            <span className="shrink-0 tabular-nums opacity-70">{it.timeLabel}</span>
            <span aria-hidden className="shrink-0 opacity-30">·</span>
            <span className="min-w-0 flex-1 truncate text-foreground/75">{it.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
