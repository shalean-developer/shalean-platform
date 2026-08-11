export type MonthlyPayoutLifecycleStage =
  | "accruing"
  | "closed"
  | "reconciled"
  | "funded"
  | "approved"
  | "paid";

export type MonthlyPayoutLifecyclePresentation = {
  stage: MonthlyPayoutLifecycleStage;
  label: string;
  description: string;
  payableNow: boolean;
};

function ymdInJohannesburg(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

export function isMonthlyPeriodClosed(periodEnd: string, now: Date = new Date()): boolean {
  return periodEnd < ymdInJohannesburg(now);
}

/**
 * Converts internal payout state into language that matches Shalean's real
 * monthly operating policy. In particular, current-month earnings are
 * accruals, not immediately payable weekly balances.
 */
export function presentMonthlyPayoutLifecycle(params: {
  periodEnd: string;
  status?: string | null;
  fundingGapCents?: number | null;
  now?: Date;
}): MonthlyPayoutLifecyclePresentation {
  const now = params.now ?? new Date();
  const status = String(params.status ?? "pending").trim().toLowerCase();
  const gap = Math.max(0, Math.round(Number(params.fundingGapCents) || 0));

  if (status === "paid") {
    return {
      stage: "paid",
      label: "Paid",
      description: "Monthly cleaner payout has been recorded as paid.",
      payableNow: false,
    };
  }
  if (status === "approved") {
    return {
      stage: "approved",
      label: "Approved for monthly payment",
      description: "Month is closed, funding checks passed and payout is approved for payment.",
      payableNow: true,
    };
  }

  if (!isMonthlyPeriodClosed(params.periodEnd, now)) {
    return {
      stage: "accruing",
      label: "Month-to-date earnings",
      description: "Earnings are still accruing for the open month. They are not due for payment yet.",
      payableNow: false,
    };
  }

  if (gap > 0) {
    return {
      stage: "reconciled",
      label: "Closed — funding gap",
      description: "The earning month is closed, but collected customer cash does not yet fully fund this payout.",
      payableNow: false,
    };
  }

  if (status === "frozen") {
    return {
      stage: "funded",
      label: "Funded monthly payout",
      description: "The month is closed and collected customer cash fully funds this payout.",
      payableNow: false,
    };
  }

  return {
    stage: "closed",
    label: "Month closed — ready to reconcile",
    description: "The earning month has closed. Reconcile customer cash and payout items before approval.",
    payableNow: false,
  };
}
