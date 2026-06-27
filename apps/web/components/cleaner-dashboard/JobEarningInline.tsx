import { Wallet } from "lucide-react";
import {
  formatCleanerJobEarningStrictDisplay,
  isCleanerJobEarningPositive,
  JOB_EARNING_LABEL,
  JOB_EARNING_UNAVAILABLE_LABEL,
  type CleanerJobEarning,
} from "@/lib/cleaner/cleanerJobEarning";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";

type JobEarningInlineProps = {
  earning: CleanerJobEarning;
  /**
   * `prominent` (default): emerald block with wallet icon, label + large
   * amount; used on the next-job pin, active-job hero, and offer card.
   * `compact`: single-line "Job earning: R___" pill for tight surfaces
   * (upcoming job rows in lists).
   */
  variant?: "prominent" | "compact";
  className?: string;
  /** Optional trailing accessory (e.g. chevron) for the prominent variant. */
  trailing?: React.ReactNode;
};

/**
 * Cross-surface "Job earning" chip — mirrors the offer card's earning panel
 * so the cleaner sees the same wording and same visual weight on every
 * card that references the job (offer → next-job pin → upcoming list →
 * active-job hero). Wording is locked to "Job earning" per product spec.
 *
 * Prominent variant shape (operational cockpit / dispatch-app style):
 *   ┌──────────────────────────────────────┐
 *   │ [💰] JOB EARNING       R400,00   →   │
 *   └──────────────────────────────────────┘
 */
export function JobEarningInline({ earning, variant = "prominent", className, trailing }: JobEarningInlineProps) {
  /**
   * Strict positive: R0 is rendered as "Job earning unavailable" because the
   * completion API rejects R0 with `job_earning_unavailable`. Showing R0 here
   * would mislead the cleaner into believing the job is completable.
   */
  const positive = isCleanerJobEarningPositive(earning);
  const ariaLabel = formatCleanerJobEarningStrictDisplay(earning);

  if (variant === "compact") {
    return (
      <span
        className={cn(
          "inline-flex items-baseline gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
          positive
            ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-600/20"
            : "bg-muted text-muted-foreground border border-border",
          className,
        )}
        aria-label={ariaLabel}
      >
        {positive ? (
          <>
            <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{JOB_EARNING_LABEL}</span>
            <span>{formatZarFromCents(earning.amount_cents ?? 0)}</span>
          </>
        ) : (
          <span className="text-xs font-medium">{JOB_EARNING_UNAVAILABLE_LABEL}</span>
        )}
      </span>
    );
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5",
        positive
          ? "bg-emerald-500/10 dark:bg-emerald-500/15"
          : "bg-amber-500/10 dark:bg-amber-500/15",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          positive
            ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-600/15 text-amber-700 dark:text-amber-300",
        )}
        aria-hidden
      >
        <Wallet className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            positive ? "text-emerald-900/70 dark:text-emerald-100/80" : "text-amber-900/80 dark:text-amber-100/85",
          )}
        >
          {JOB_EARNING_LABEL}
        </p>
        {positive ? (
          <p
            className="mt-0.5 text-xl font-extrabold tabular-nums leading-none text-emerald-900 dark:text-emerald-50"
            data-testid="job-earning-amount"
          >
            {formatZarFromCents(earning.amount_cents ?? 0)}
          </p>
        ) : (
          <p
            className="mt-0.5 text-sm font-semibold text-amber-900 dark:text-amber-100"
            data-testid="job-earning-unavailable"
          >
            {JOB_EARNING_UNAVAILABLE_LABEL}
          </p>
        )}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
