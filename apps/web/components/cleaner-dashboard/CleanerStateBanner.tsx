"use client";

import type { ReactNode } from "react";
import { Bell, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CleanerDashboardInfoHint } from "./CleanerDashboardInfoHint";
import { CleanerPerformanceStatsRow, type CleanerPerformanceMetrics } from "./CleanerPerformanceCard";
import { cn } from "@/lib/utils";

export type CleanerStateBannerProps = {
  browserOnline: boolean;
  /** Platform “available for offers” (matches `mapCleanerMeToMobileProfile` / PATCH `is_available`). */
  receivingOffers: boolean;
  /** Cleaner’s weekday roster includes today (Johannesburg civil day). */
  rosterIncludesToday: boolean;
  onGoAvailable?: () => void;
  onGoOffline?: () => void;
  availabilityBusy?: boolean;
  /** Inside a parent card — no outer chrome (shared shell). */
  embedded?: boolean;
  /** When set with `embedded`, stats render in the same card below a divider (dashboard). */
  performanceMetrics?: CleanerPerformanceMetrics | null;
  /**
   * Dispatch-console layout variant — renders as a single-row pill: status
   * dot + availability label + perf chips on the right + Go online / Go
   * offline button. Used on Home so availability never dominates the
   * vertical space above pending offers.
   */
  compact?: boolean;
  /**
   * Compact-mode only: number of open (non-completed/cancelled) jobs and the
   * Today earnings label. Rendered inline on a second metrics row so the
   * cleaner sees status + jobs + rating + today in a single dense strip.
   */
  openJobsCount?: number | null;
  todayEarningsLabel?: string | null;
  /**
   * Compact-mode only: when true AND the cleaner is online + receiving
   * offers, the strip renders an inline "Looking for nearby jobs" ticker
   * between the status row and the metrics row. This replaces the old
   * stand-alone NextJobEmptyHint card so idle state collapses into the
   * single operational surface.
   */
  idle?: boolean;
  /**
   * Compact-mode only: false renders the softer "Checking for nearby
   * jobs…" copy until the dashboard has confirmed the queue is empty
   * (`computeConfirmedIdle`).
   */
  searchingConfirmed?: boolean;
  /**
   * Compact-mode only: notification permission state for the inline
   * "Enable alerts" CTA on the searching line. Only "default" surfaces
   * the button; "granted" / "denied" / "unsupported" hide it.
   */
  notificationPermission?: "default" | "granted" | "denied" | "unsupported";
  /**
   * Compact-mode only: invoked after `Notification.requestPermission()`
   * resolves to `"granted"`. The strip itself triggers the prompt; this
   * callback is the parent's "post-grant" hook (toast / re-fetch / etc.).
   */
  onNotificationsGranted?: () => void;
  /**
   * Compact-mode only: optional workload hint surfaced as a sub-label
   * next to the primary status pill. Pure presentation — derived upstream
   * by `deriveCleanerAvailabilityState` from booking rows + roster, never
   * from `cleaners.is_available`. Use to differentiate "Online · Booked"
   * (future job accepted) from "Busy · In job" (en route / in progress)
   * from "Off today" (manually online but not on roster).
   */
  workloadHint?: "active" | "booked" | "off-today" | null;
};

type Tone = "red" | "amber" | "emerald";

function mergeTopTone(tone: Tone): string {
  return cn(
    "px-4 py-4",
    tone === "red" && "bg-red-500/10 text-red-950 dark:bg-red-500/15 dark:text-red-50",
    tone === "amber" && "bg-amber-500/10 text-amber-950 dark:bg-amber-500/15 dark:text-amber-50",
    tone === "emerald" && "bg-emerald-500/10 text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-50",
  );
}

/**
 * Primary dashboard control: network + availability, with explicit go online / go offline actions.
 */
export function CleanerStateBanner({
  browserOnline,
  receivingOffers,
  rosterIncludesToday,
  onGoAvailable,
  onGoOffline,
  availabilityBusy,
  embedded,
  performanceMetrics,
  compact,
  openJobsCount,
  todayEarningsLabel,
  idle,
  searchingConfirmed,
  notificationPermission,
  onNotificationsGranted,
  workloadHint,
}: CleanerStateBannerProps) {
  const busy = Boolean(availabilityBusy);
  const merged = Boolean(embedded && performanceMetrics);

  if (compact) {
    return (
      <CleanerStatusStrip
        browserOnline={browserOnline}
        receivingOffers={receivingOffers}
        rosterIncludesToday={rosterIncludesToday}
        onGoAvailable={onGoAvailable}
        onGoOffline={onGoOffline}
        availabilityBusy={busy}
        performanceMetrics={performanceMetrics ?? null}
        openJobsCount={openJobsCount ?? null}
        todayEarningsLabel={todayEarningsLabel ?? null}
        idle={Boolean(idle)}
        searchingConfirmed={searchingConfirmed !== false}
        notificationPermission={notificationPermission ?? "unsupported"}
        onNotificationsGranted={onNotificationsGranted}
        workloadHint={workloadHint ?? null}
      />
    );
  }

  const shell = (tone: Tone, extra: string) =>
    cn(
      "transition-[background-color,border-color,color] duration-200 ease-out",
      embedded ? "px-0 py-0" : "rounded-2xl border px-4 py-4",
      !embedded && tone === "red" && "border-red-500/35 bg-red-500/10",
      !embedded && tone === "amber" && "border-amber-500/45 bg-amber-500/10",
      !embedded && tone === "emerald" && "border-emerald-500/45 bg-emerald-500/10",
      embedded && tone === "red" && "rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3",
      embedded && tone === "amber" && "rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-3",
      embedded && tone === "emerald" && "rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-3",
      extra,
    );

  const wrap = (tone: Tone, aria: string, body: ReactNode) => {
    if (merged && performanceMetrics) {
      return (
        <section
          aria-label="Availability and performance"
          className="overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-sm"
        >
          <div className={mergeTopTone(tone)}>{body}</div>
          <div className="border-t border-border/80 bg-muted/20 px-4 py-3 dark:bg-muted/10">
            <div className="mb-2 flex items-center justify-end gap-1.5">
              <CleanerDashboardInfoHint
                label="About these numbers"
                text="Based on your completed jobs and customer feedback."
                triggerClassName="text-muted-foreground hover:text-foreground"
              />
            </div>
            <CleanerPerformanceStatsRow metrics={performanceMetrics} compact />
          </div>
        </section>
      );
    }
    return (
      <section aria-label={aria} className={shell(tone, "")}>
        {body}
      </section>
    );
  };

  if (!browserOnline) {
    return wrap(
      "red",
      "Connection and availability",
      <>
        <p className="text-lg font-bold tracking-tight">You&apos;re offline</p>
        <p className="mt-1 text-sm font-normal leading-relaxed text-red-900/85 dark:text-red-100/85">
          Reconnect to the internet, then you can go online for offers again.
        </p>
      </>,
    );
  }

  if (!receivingOffers) {
    return wrap(
      "amber",
      "Availability control",
      <>
        <p className="text-lg font-bold tracking-tight">You&apos;re not receiving offers</p>
        <p className="mt-1 text-sm font-normal leading-relaxed text-amber-900/90 dark:text-amber-100/85">
          Go online when you&apos;re ready — we&apos;ll match you to jobs automatically.
        </p>
        {onGoAvailable ? (
          <Button
            type="button"
            size="default"
            role="button"
            aria-pressed={false}
            aria-label="Go online for job offers"
            className="mt-4 min-h-11 w-full bg-amber-600 text-white transition-colors duration-200 hover:bg-amber-600/90 active:scale-[0.98] sm:w-auto"
            disabled={busy}
            onClick={() => onGoAvailable()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Go online"
            )}
          </Button>
        ) : null}
      </>,
    );
  }

  return wrap(
    "emerald",
    "Availability control",
    <>
      <div className="flex flex-wrap items-start gap-1.5">
        <p className="text-lg font-bold tracking-tight">You&apos;re available</p>
        <CleanerDashboardInfoHint
          variant="default"
          triggerClassName="text-emerald-900/65 hover:text-emerald-950 focus-visible:text-emerald-950 dark:text-emerald-100/65 dark:hover:text-emerald-50 dark:focus-visible:text-emerald-50"
          label="How availability and dispatch work"
          text={`We'll send jobs when a match is found.\n\nStay on this screen to receive offers faster.`}
        />
      </div>
      <p className="mt-1 text-sm font-medium text-emerald-900/95 dark:text-emerald-100/90">Waiting for job offers</p>
      {!rosterIncludesToday ? (
        <p className="mt-2 text-xs font-normal text-emerald-900/75 dark:text-emerald-100/70">
          Your usual roster doesn&apos;t include today — you can still get offers.
        </p>
      ) : null}
      {onGoOffline ? (
        <Button
          type="button"
          variant="outline"
          size="default"
          role="button"
          aria-pressed={true}
          aria-label="Go offline — stop receiving job offers"
          className={cn(
            "mt-4 min-h-11 w-full border-2 shadow-sm transition-colors duration-200 active:scale-[0.98] sm:w-auto",
            merged
              ? "border-emerald-700/40 bg-emerald-950/5 text-emerald-950 hover:bg-emerald-950/10 dark:border-emerald-300/40 dark:bg-emerald-950/25 dark:text-emerald-50 dark:hover:bg-emerald-950/35"
              : "border-emerald-700/50 bg-emerald-950/5 text-emerald-950 hover:bg-emerald-950/10 dark:border-emerald-300/45 dark:bg-emerald-950/20 dark:text-emerald-50 dark:hover:bg-emerald-950/30",
          )}
          disabled={busy}
          onClick={() => onGoOffline()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Go offline"
          )}
        </Button>
      ) : null}
    </>,
  );
}

type CleanerStatusStripProps = {
  browserOnline: boolean;
  receivingOffers: boolean;
  /**
   * Cleaner's roster includes today. Currently consumed only via the
   * `workloadHint='off-today'` badge supplied by the parent (which derives
   * the same signal centrally). Kept on the props for parity with the
   * non-compact `CleanerStateBanner` and as forward-compat hook for inline
   * roster copy if we re-introduce it.
   */
  rosterIncludesToday: boolean;
  onGoAvailable?: () => void;
  onGoOffline?: () => void;
  availabilityBusy: boolean;
  performanceMetrics: CleanerPerformanceMetrics | null;
  openJobsCount: number | null;
  todayEarningsLabel: string | null;
  idle: boolean;
  searchingConfirmed: boolean;
  notificationPermission: "default" | "granted" | "denied" | "unsupported";
  onNotificationsGranted?: () => void;
  workloadHint: "active" | "booked" | "off-today" | null;
};

function shortStatusLabel(browserOnline: boolean, receivingOffers: boolean): string {
  if (!browserOnline) return "Offline";
  if (!receivingOffers) return "Paused";
  return "Online";
}

/**
 * Workload sub-label that appears next to the primary status pill ("Online").
 * Mutually exclusive — chosen by the caller's deriver. Returns null when no
 * workload hint applies (idle online cleaner on roster).
 */
function workloadHintBadge(
  workloadHint: "active" | "booked" | "off-today" | null,
  receivingOffers: boolean,
  browserOnline: boolean,
): { label: string; tone: "sky" | "emerald" | "amber" } | null {
  if (!browserOnline || !receivingOffers || !workloadHint) return null;
  if (workloadHint === "active") return { label: "In job", tone: "sky" };
  if (workloadHint === "booked") return { label: "Booked", tone: "emerald" };
  return { label: "Off today", tone: "amber" };
}

function ratingChipText(rating: number | null): string {
  if (rating == null) return "—";
  const rounded = Math.round(rating * 10) / 10;
  return rounded.toFixed(1);
}

/**
 * Operational cockpit strip — the single surface that answers "what's my
 * state and what am I doing right now?".
 *
 * Online + idle:
 *   ┌────────────────────────────────────────────┐
 *   │ ● Online                       [Go offline] │
 *   │ 🔍 Looking for nearby jobs    [Enable 🔔]   │   (last button optional)
 *   │ Jobs 0 · ★ 5.0 · Today R250                 │
 *   └────────────────────────────────────────────┘
 *
 * Online + busy (active or next job exists upstream):
 *   ┌────────────────────────────────────────────┐
 *   │ ● Online                       [Go offline] │
 *   │ Jobs 1 · ★ 5.0 · Today R250                 │
 *   └────────────────────────────────────────────┘
 *
 * Paused / Offline:
 *   ┌────────────────────────────────────────────┐
 *   │ ● Paused                       [Go online]  │
 *   │ Jobs 0 · ★ 5.0 · Today R250                 │
 *   └────────────────────────────────────────────┘
 *
 * Why this is one card:
 *  - Status, "looking for jobs", jobs/rating/today, and the Go on/offline
 *    toggle all describe the same operational state. Splitting them into
 *    separate cards (status card + searching card + earnings ticker) was
 *    fragmented and added unnecessary vertical chrome without adding
 *    information. This collapses everything into one tinted surface with
 *    soft chrome (no hard border) so the rest of the dashboard breathes.
 */
function CleanerStatusStrip({
  browserOnline,
  receivingOffers,
  rosterIncludesToday,
  onGoAvailable,
  onGoOffline,
  availabilityBusy,
  performanceMetrics,
  openJobsCount,
  todayEarningsLabel,
  idle,
  searchingConfirmed,
  notificationPermission,
  onNotificationsGranted,
  workloadHint,
}: CleanerStatusStripProps) {
  // `rosterIncludesToday` is intentionally unread here: parents derive the
  // same flag centrally (`deriveCleanerAvailabilityState`) and pass the
  // resulting `workloadHint='off-today'`. Kept on props for shared shape.
  void rosterIncludesToday;
  const busy = availabilityBusy;
  const tone: Tone = !browserOnline ? "red" : !receivingOffers ? "amber" : "emerald";
  const label = shortStatusLabel(browserOnline, receivingOffers);
  const hintBadge = workloadHintBadge(workloadHint, receivingOffers, browserOnline);
  const dotClass = cn(
    "size-2 shrink-0 rounded-full",
    tone === "red" && "bg-red-600",
    tone === "amber" && "bg-amber-500",
    tone === "emerald" && "bg-emerald-500 motion-safe:animate-pulse",
  );
  // Soft tinted surface, no hard border — premium polish: the strip reads
  // as background colour, not a bordered box.
  const stripClass = cn(
    "rounded-xl px-3 py-2.5 transition-colors",
    tone === "red" && "bg-red-500/10 text-red-950 dark:text-red-50",
    tone === "amber" && "bg-amber-500/10 text-amber-950 dark:text-amber-50",
    tone === "emerald" && "bg-emerald-500/10 text-emerald-950 dark:text-emerald-50",
  );

  const jobs = openJobsCount;
  const ratingText = ratingChipText(performanceMetrics?.rating ?? null);
  const today = todayEarningsLabel ?? "—";

  // The searching ticker only appears when the cleaner is actually online +
  // receiving + idle. Paused / offline already say it all in the status row.
  const showSearchingLine = browserOnline && receivingOffers && idle;
  const showEnableNotifications = showSearchingLine && notificationPermission === "default";
  const searchingLabel = searchingConfirmed ? "Looking for nearby jobs" : "Checking for nearby jobs…";

  const requestNotify = () => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    void Notification.requestPermission().then((p) => {
      if (p === "granted") onNotificationsGranted?.();
    });
  };

  return (
    <section aria-label="Availability and metrics" className={stripClass}>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={dotClass} aria-hidden />
          <p className="truncate text-sm font-semibold">{label}</p>
          {hintBadge ? (
            <>
              <span aria-hidden className="text-xs opacity-40">
                ·
              </span>
              <span
                aria-label={`Workload: ${hintBadge.label}`}
                className={cn(
                  "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide",
                  hintBadge.tone === "sky" &&
                    "bg-sky-500/15 text-sky-900 dark:bg-sky-400/20 dark:text-sky-50",
                  hintBadge.tone === "emerald" &&
                    "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-50",
                  hintBadge.tone === "amber" &&
                    "bg-amber-500/15 text-amber-900 dark:bg-amber-400/20 dark:text-amber-50",
                )}
              >
                {hintBadge.label}
              </span>
            </>
          ) : null}
        </div>
        {browserOnline && !receivingOffers && onGoAvailable ? (
          <Button
            type="button"
            size="sm"
            aria-pressed={false}
            aria-label="Go online for job offers"
            className="h-8 rounded-full bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-600/90 active:scale-[0.98]"
            disabled={busy}
            onClick={() => onGoAvailable()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Go online"
            )}
          </Button>
        ) : null}
        {browserOnline && receivingOffers && onGoOffline ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={true}
            aria-label="Go offline — stop receiving job offers"
            className={cn(
              "h-8 rounded-full px-3 text-xs font-semibold active:scale-[0.98]",
              "text-emerald-900 hover:bg-emerald-950/10 dark:text-emerald-50 dark:hover:bg-emerald-950/30",
            )}
            disabled={busy}
            onClick={() => onGoOffline()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Go offline"
            )}
          </Button>
        ) : null}
      </div>
      {showSearchingLine ? (
        <div className="mt-2 flex items-center gap-2">
          <Search
            className="size-3.5 shrink-0 opacity-65 motion-safe:animate-pulse"
            aria-hidden
          />
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium opacity-85">{searchingLabel}</p>
          {showEnableNotifications ? (
            <button
              type="button"
              onClick={requestNotify}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-emerald-950/10 px-2 text-[11px] font-semibold text-emerald-900 transition-colors hover:bg-emerald-950/15 active:scale-[0.97] dark:bg-emerald-50/15 dark:text-emerald-50 dark:hover:bg-emerald-50/20"
              aria-label="Enable browser notifications"
            >
              <Bell className="size-3" aria-hidden />
              Enable alerts
            </button>
          ) : null}
        </div>
      ) : null}
      <dl className="mt-2 flex items-baseline gap-3 text-[13px] font-medium tabular-nums">
        <div className="flex items-baseline gap-1">
          <dt className="text-[11px] uppercase tracking-wide opacity-60">Jobs</dt>
          <dd className="font-semibold">{jobs == null ? "—" : jobs}</dd>
        </div>
        <span aria-hidden className="opacity-30">·</span>
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Rating</dt>
          <dd>
            <span aria-hidden>★ </span>
            <span className="font-semibold">{ratingText}</span>
          </dd>
        </div>
        <span aria-hidden className="opacity-30">·</span>
        <div className="flex items-baseline gap-1">
          <dt className="text-[11px] uppercase tracking-wide opacity-60">Today</dt>
          <dd className="font-semibold">{today}</dd>
        </div>
      </dl>
    </section>
  );
}
