export type RecurringRevenuePlanInput = {
  status: string;
  price: number | null | undefined;
  frequency: string;
  days_of_week: number[] | null | undefined;
};

/** Forward-looking monthly estimate: price × visits/month from schedule frequency. */
export function estimateMonthlyRevenue(plan: RecurringRevenuePlanInput): number {
  if (plan.status.toLowerCase() !== "active") return 0;
  const price = plan.price ?? 0;
  const days = Math.max(1, plan.days_of_week?.length ?? 1);
  const f = plan.frequency.toLowerCase();
  let visitsPerMonth: number;
  if (f === "weekly") visitsPerMonth = (52 / 12) * days;
  else if (f === "biweekly" || f === "fortnightly") visitsPerMonth = (26 / 12) * days;
  else if (f === "monthly") visitsPerMonth = days;
  else visitsPerMonth = (52 / 12) * days;
  return Math.round(price * visitsPerMonth);
}

export function sumEstimatedMonthlyRevenue(plans: RecurringRevenuePlanInput[]): number {
  return plans.reduce((sum, plan) => sum + estimateMonthlyRevenue(plan), 0);
}
