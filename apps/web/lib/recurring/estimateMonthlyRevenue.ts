export type RecurringRevenuePlanInput = {
  status: string;
  price: number | null | undefined;
  frequency: string;
  days_of_week: number[] | null | undefined;
};

export type RecurringEstimateInput = {
  frequency: string | null | undefined;
  /** Weekday numbers 0–6, or already-resolved day count via length. */
  daysOfWeek?: number[] | string[] | null;
  pricePerVisitZar: number;
};

/** Estimated visits per calendar month from schedule frequency (shared wizard + admin math). */
export function estimateVisitsPerMonth(
  frequency: string | null | undefined,
  daysOfWeek?: number[] | string[] | null,
): number {
  const days = Math.max(1, daysOfWeek?.length ?? 1);
  const f = String(frequency ?? "")
    .trim()
    .toLowerCase();
  if (f === "weekly") return (52 / 12) * days;
  if (f === "biweekly" || f === "fortnightly") return (26 / 12) * days;
  if (f === "monthly") return days;
  return (52 / 12) * days;
}

/** Forward-looking monthly estimate: price × visits/month from schedule frequency. */
export function estimateMonthlyRevenue(plan: RecurringRevenuePlanInput): number {
  if (plan.status.toLowerCase() !== "active") return 0;
  const price = plan.price ?? 0;
  return Math.round(price * estimateVisitsPerMonth(plan.frequency, plan.days_of_week));
}

export function sumEstimatedMonthlyRevenue(plans: RecurringRevenuePlanInput[]): number {
  return plans.reduce((sum, plan) => sum + estimateMonthlyRevenue(plan), 0);
}

/** Customer-facing estimate block for checkout / review / payment. */
export function estimateRecurringMonthlySpend(input: RecurringEstimateInput): {
  visitsPerMonth: number;
  estimatedMonthlyZar: number;
} {
  const visitsPerMonth = estimateVisitsPerMonth(input.frequency, input.daysOfWeek);
  const estimatedMonthlyZar = Math.round(Math.max(0, input.pricePerVisitZar) * visitsPerMonth);
  return {
    visitsPerMonth: Math.round(visitsPerMonth * 10) / 10,
    estimatedMonthlyZar,
  };
}
