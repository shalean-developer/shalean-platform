"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
  /** Inside {@link CleanerHeroStack} — no outer card chrome (shared shell). */
  embedded?: boolean;
  /** When set with `embedded`, stats render in the same card below a divider (dashboard). */
  performanceMetrics?: CleanerPerformanceMetrics | null;
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
}: CleanerStateBannerProps) {
  const busy = Boolean(availabilityBusy);
  const merged = Boolean(embedded && performanceMetrics);

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
