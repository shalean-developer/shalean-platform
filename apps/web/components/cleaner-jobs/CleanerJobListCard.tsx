import Link from "next/link";
import { Navigation } from "lucide-react";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { formatJobScopeCompactLine, getCleanerJobUrgencyUi, splitJobLocationPrimarySecondary } from "@/lib/cleaner/cleanerJobsListDerived";
import { cleanerFacingDisplayEarningsCents, mobilePhaseDisplayForDashboard } from "@/lib/cleaner/cleanerMobileBookingMap";
import { directionsHrefFromQuery } from "@/lib/cleaner/directionsHref";
import { formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { cn } from "@/lib/utils";

export type CleanerJobListCardVariant = "upcoming" | "past";

function phaseChipClass(label: string): string {
  const s = label.trim().toLowerCase();
  if (s === "completed")
    return "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 border border-emerald-600/20";
  if (s === "cancelled") return "bg-muted text-muted-foreground border border-border";
  if (s === "in progress") return "bg-sky-500/15 text-sky-900 dark:text-sky-100 border border-sky-600/20";
  if (s === "en route") return "bg-amber-500/15 text-amber-950 dark:text-amber-100 border border-amber-600/25";
  if (s === "assigned") return "bg-violet-500/12 text-violet-900 dark:text-violet-100 border border-violet-600/18";
  if (s === "pending") return "bg-zinc-500/12 text-zinc-900 dark:text-zinc-100 border border-zinc-600/20";
  return "bg-muted text-muted-foreground border border-border";
}

export type CleanerJobListCardProps = {
  row: CleanerBookingRow;
  variant: CleanerJobListCardVariant;
  now?: Date;
};

export function CleanerJobListCard({ row, variant, now = new Date() }: CleanerJobListCardProps) {
  const href = `/cleaner/jobs/${encodeURIComponent(row.id)}`;
  const cents = cleanerFacingDisplayEarningsCents(row);
  const rec = row as Record<string, unknown>;
  const estimate =
    row.displayEarningsIsEstimate === true ||
    row.earnings_estimated === true ||
    rec.displayEarningsIsEstimate === true ||
    rec.earnings_estimated === true;

  const payBlock =
    cents != null ? (
      estimate ? (
        <p className="text-lg font-bold tabular-nums tracking-tight text-foreground">
          Estimated: {formatZarWhole(Math.round(cents / 100))}
        </p>
      ) : (
        <p className="text-lg font-bold tabular-nums tracking-tight text-foreground">
          {formatZarWhole(Math.round(cents / 100))}
        </p>
      )
    ) : (
      <p className="text-lg font-semibold text-muted-foreground">Processing…</p>
    );

  const service = String(row.service ?? row.service_name ?? "").trim() || "Job";
  const { primary: locPrimary, secondary: locSecondary } = splitJobLocationPrimarySecondary(row.location);
  const scopeLine = formatJobScopeCompactLine(row);
  const phase = mobilePhaseDisplayForDashboard(row);
  const timeRaw = String(row.time ?? "").trim() || "—";
  const dateRaw = String(row.date ?? "").trim();
  const whenLine =
    variant === "upcoming"
      ? `${dateRaw ? jobDateHeading(dateRaw, now) : "Scheduled"} · ${timeRaw}`
      : timeRaw;

  const ui = variant === "upcoming" ? getCleanerJobUrgencyUi(row, now.getTime()) : null;

  const directionsRaw = String(row.location ?? "").trim();
  const directionsHref =
    variant === "upcoming" && directionsRaw
      ? directionsHrefFromQuery(directionsRaw.split(/\r?\n/)[0]?.trim() ?? directionsRaw)
      : "";

  const border =
    variant === "upcoming"
      ? "border-emerald-600/25 bg-gradient-to-b from-emerald-500/8 to-card hover:border-emerald-500/35"
      : "border-border bg-card hover:border-border";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{payBlock}</div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${phaseChipClass(phase)}`}>{phase}</span>
      </div>
      <p className="mt-1 font-medium leading-snug text-foreground">{service}</p>
      <p className="mt-1 text-base font-semibold leading-snug text-foreground">{locPrimary}</p>
      {locSecondary ? <p className="text-sm leading-snug text-muted-foreground">{locSecondary}</p> : null}
      {scopeLine ? (
        <p className="mt-1 truncate text-sm text-muted-foreground" title={scopeLine}>
          {scopeLine}
        </p>
      ) : null}
      {ui?.leaveText ? <p className="mt-2 text-sm font-semibold text-sky-800 dark:text-sky-200">{ui.leaveText}</p> : null}
      {ui?.startsInText ? (
        <p
          className={cn(
            "mt-0.5 text-sm font-semibold",
            ui.startsInWarn ? "text-amber-700 dark:text-amber-200" : "text-muted-foreground",
          )}
        >
          {ui.startsInText}
        </p>
      ) : null}
      {ui?.lateText ? (
        <p
          className={cn(
            "mt-0.5 text-sm font-semibold",
            ui.lateLevel === "redPulse"
              ? "animate-pulse text-red-600 dark:text-red-400"
              : "text-amber-700 dark:text-amber-200",
          )}
        >
          {ui.lateText}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{whenLine}</p>
    </>
  );

  if (variant === "past") {
    return (
      <Link
        href={href}
        className={cn(
          "block rounded-xl border p-3 shadow-sm outline-none ring-offset-background transition-all hover:bg-accent/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
          border,
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border shadow-sm outline-none ring-offset-background transition-all hover:shadow-sm",
        border,
      )}
    >
      <Link
        href={href}
        className="block p-3 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
      >
        {body}
      </Link>
      <div className="flex flex-wrap gap-2 border-t border-border/60 bg-muted/10 px-3 py-2">
        {directionsHref ? (
          <a
            href={directionsHref}
            rel="noopener noreferrer"
            target="_blank"
            className="inline-flex min-h-12 min-w-[44%] flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent/50 sm:min-w-[10rem]"
          >
            <Navigation className="h-4 w-4 shrink-0" aria-hidden />
            Directions
          </a>
        ) : null}
        <Link
          href={href}
          className="inline-flex min-h-12 min-w-[44%] flex-1 items-center justify-center rounded-xl border border-transparent px-3 text-sm font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-200 sm:min-w-[8rem]"
        >
          View job
        </Link>
      </div>
    </div>
  );
}
