"use client";

import type { TrustJobCompletionFeedback } from "@/lib/cleaner/trustJobCompletionFeedback";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";

export function CleanerJobCompletionTrustBanner({
  feedback,
  className,
}: {
  feedback: TrustJobCompletionFeedback;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/35",
        className,
      )}
      role="status"
    >
      <p className="font-semibold text-emerald-950 dark:text-emerald-100">✔ Job completed</p>
      <p className="mt-1 text-emerald-900 dark:text-emerald-100/95">
        {feedback.kind === "amount"
          ? `+${formatZarFromCents(feedback.cents)} added to your earnings`
          : "Earnings will be processed shortly"}
      </p>
      {typeof feedback.todayTotalCents === "number" && feedback.todayTotalCents > 0 ? (
        <p className="mt-1.5 text-xs font-medium text-emerald-800/95 dark:text-emerald-200/90">
          Today: {formatZarFromCents(feedback.todayTotalCents)} total
        </p>
      ) : null}
    </div>
  );
}
