import Link from "next/link";
import { Navigation } from "lucide-react";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { getCleanerJobUrgencyUi, splitJobLocationPrimarySecondary } from "@/lib/cleaner/cleanerJobsListDerived";
import { cleanerFacingDisplayEarningsCents } from "@/lib/cleaner/cleanerMobileBookingMap";
import { directionsHrefFromQuery } from "@/lib/cleaner/directionsHref";
import { formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { cn } from "@/lib/utils";

export type CleanerNextJobHeroProps = {
  row: CleanerBookingRow;
  now: Date;
};

export function CleanerNextJobHero({ row, now }: CleanerNextJobHeroProps) {
  const href = `/cleaner/jobs/${encodeURIComponent(row.id)}`;
  const d = String(row.date ?? "").trim();
  const t = String(row.time ?? "").trim() || "—";
  const todayYmd = johannesburgCalendarYmd(now);
  const head = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? jobDateHeading(d, now) : "Scheduled";
  const schedulePrimary = d && d.slice(0, 10) === todayYmd ? `Today · ${t}` : `${head} · ${t}`;
  const { primary: suburb } = splitJobLocationPrimarySecondary(row.location);
  const ui = getCleanerJobUrgencyUi(row, now.getTime());
  const directionsRaw = String(row.location ?? "").trim();
  const directionsHref = directionsRaw ? directionsHrefFromQuery(directionsRaw.split(/\r?\n/)[0]?.trim() ?? directionsRaw) : "";

  const cents = cleanerFacingDisplayEarningsCents(row);
  const rec = row as Record<string, unknown>;
  const estimate =
    row.displayEarningsIsEstimate === true ||
    row.earnings_estimated === true ||
    rec.displayEarningsIsEstimate === true ||
    rec.earnings_estimated === true;
  const earningsNudge =
    cents != null
      ? estimate
        ? `Next job (estimated): ${formatZarWhole(Math.round(cents / 100))}`
        : `Next job earns ${formatZarWhole(Math.round(cents / 100))}`
      : null;

  return (
    <div
      className={cn(
        "sticky top-0 z-20 space-y-2 rounded-xl border-2 border-emerald-600/40 bg-gradient-to-b from-emerald-500/15 via-card to-card p-4 shadow-md",
        "backdrop-blur-sm",
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-200">Next job</p>
      <p className="text-base font-semibold text-foreground">{schedulePrimary}</p>
      <p className="text-sm font-medium text-foreground">{suburb}</p>
      {ui.leaveText ? <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">{ui.leaveText}</p> : null}
      {ui.startsInText ? (
        <p
          className={cn(
            "text-sm font-semibold",
            ui.startsInWarn ? "text-amber-700 dark:text-amber-200" : "text-muted-foreground",
          )}
        >
          {ui.startsInText}
        </p>
      ) : null}
      {ui.lateText ? (
        <p
          className={cn(
            "text-sm font-semibold",
            ui.lateLevel === "redPulse"
              ? "animate-pulse text-red-600 dark:text-red-400"
              : "text-amber-700 dark:text-amber-200",
          )}
        >
          {ui.lateText}
        </p>
      ) : null}
      {earningsNudge ? <p className="text-xs font-medium text-muted-foreground">{earningsNudge}</p> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {directionsHref ? (
          <a
            href={directionsHref}
            rel="noopener noreferrer"
            target="_blank"
            className="inline-flex min-h-12 min-w-[9.5rem] flex-1 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 sm:flex-none"
          >
            <Navigation className="h-4 w-4 shrink-0" aria-hidden />
            Start navigation
          </a>
        ) : null}
        <Link
          href={href}
          className={cn(
            "inline-flex min-h-12 min-w-[9rem] flex-1 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent/50 sm:flex-none",
            !directionsHref && "flex-1",
          )}
        >
          View details
        </Link>
      </div>
    </div>
  );
}
