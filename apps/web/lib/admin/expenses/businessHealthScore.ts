import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFleetHourUtilizationPct } from "@/lib/admin/reporting/bookingDurationReporting";
import { loadProfitSnapshot } from "@/lib/admin/expenses/loadCashFlowDashboard";
import { FUTURE_MAX_CLEANER_DAY_MINUTES } from "@/lib/booking/durationMinutesIntegrity";

export type HealthMetric = {
  key: string;
  label: string;
  score: number;
  weight: number;
  trend: "up" | "down" | "flat";
  direction: "positive" | "negative";
  value: number | null;
  unit: string;
};

export type BusinessHealthScorePayload = {
  score_date: string;
  overall_score: number;
  status_label: string;
  metrics: HealthMetric[];
  recommendations: string[];
  history: Array<{ score_date: string; overall_score: number; status_label: string }>;
};

const WEIGHTS = {
  revenue_growth: 15,
  net_profit_margin: 20,
  customer_retention: 15,
  cleaner_utilization: 15,
  expense_ratio: 15,
  outstanding_invoices: 10,
  cash_runway: 10,
} as const;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function growthScore(current: number, previous: number): { score: number; trend: "up" | "down" | "flat" } {
  if (previous <= 0 && current <= 0) return { score: 50, trend: "flat" };
  if (previous <= 0) return { score: 90, trend: "up" };
  const pct = ((current - previous) / previous) * 100;
  const trend = pct > 2 ? "up" : pct < -2 ? "down" : "flat";
  const score = clampScore(50 + pct);
  return { score, trend };
}

function ratioScore(ratio: number, goodBelow: number): { score: number; trend: "up" | "down" | "flat" } {
  const score = clampScore(100 - (ratio / goodBelow) * 50);
  const trend = ratio < goodBelow ? "up" : ratio > goodBelow * 1.2 ? "down" : "flat";
  return { score, trend };
}

function statusFromScore(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 30) return "At Risk";
  return "Critical";
}

export async function computeBusinessHealthScore(
  admin: SupabaseClient,
  scoreDate?: string,
): Promise<BusinessHealthScorePayload> {
  const today = scoreDate ?? new Date().toISOString().slice(0, 10);
  const { current, previous } = await loadProfitSnapshot(admin, 30);

  const revenueGrowth = growthScore(current.customer_revenue_cents, previous.customer_revenue_cents);
  const marginCurrent = current.net_profit_percent ?? 0;
  const marginPrevious = previous.net_profit_percent ?? 0;
  const marginScore = clampScore(marginCurrent * 2 + 20);
  const marginTrend: "up" | "down" | "flat" =
    marginCurrent > marginPrevious + 1 ? "up" : marginCurrent < marginPrevious - 1 ? "down" : "flat";

  const expenseRatio = current.expense_ratio_percent ?? 0;
  const expenseScore = ratioScore(expenseRatio, 30);

  const { count: activeCustomers } = await admin
    .from("bookings")
    .select("customer_id", { count: "exact", head: true })
    .eq("status", "completed")
    .gte("date", new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10));

  const { count: repeatCustomers } = await admin
    .from("bookings")
    .select("customer_id", { count: "exact", head: true })
    .eq("status", "completed")
    .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));

  const retentionScore = clampScore(
    activeCustomers && repeatCustomers ? (repeatCustomers / activeCustomers) * 100 : 60,
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { count: activeCleaners } = await admin
    .from("cleaners")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  const { data: completedForUtilization } = await admin
    .from("bookings")
    .select(
      "duration_minutes, estimated_duration_minutes, pricing_summary, booking_snapshot, cleaner_id",
    )
    .eq("status", "completed")
    .not("cleaner_id", "is", null)
    .gte("date", thirtyDaysAgo)
    .limit(15_000);

  const utilizationPct = computeFleetHourUtilizationPct({
    bookings: completedForUtilization ?? [],
    activeCleanerCount: activeCleaners ?? 0,
    windowDays: 30,
    policyMinutesPerCleanerDay: FUTURE_MAX_CLEANER_DAY_MINUTES,
  });
  const utilizationScore = clampScore(utilizationPct);

  const { data: overdueInvoices } = await admin
    .from("monthly_invoices")
    .select("balance_cents")
    .in("status", ["overdue", "partially_paid", "sent"]);

  const outstandingCents = (overdueInvoices ?? []).reduce((s, r) => s + (r.balance_cents ?? 0), 0);
  const outstandingRatio =
    current.customer_revenue_cents > 0 ? (outstandingCents / current.customer_revenue_cents) * 100 : 0;
  const outstandingScore = clampScore(100 - outstandingRatio * 2);
  const outstandingTrend: "up" | "down" | "flat" =
    outstandingRatio > 15 ? "down" : outstandingRatio < 5 ? "up" : "flat";

  const { data: accounts } = await admin
    .from("expense_accounts")
    .select("balance_cents")
    .eq("is_active", true);
  const totalCash = (accounts ?? []).reduce((s, a) => s + (a.balance_cents ?? 0), 0);
  const monthlyBurn = current.operating_expenses_cents + current.cleaner_payouts_cents;
  const runwayMonths = monthlyBurn > 0 ? totalCash / monthlyBurn : 12;
  const runwayScore = clampScore(Math.min(100, runwayMonths * 25));
  const runwayTrend: "up" | "down" | "flat" = runwayMonths >= 3 ? "up" : runwayMonths < 1 ? "down" : "flat";

  const metrics: HealthMetric[] = [
    {
      key: "revenue_growth",
      label: "Revenue Growth",
      score: revenueGrowth.score,
      weight: WEIGHTS.revenue_growth,
      trend: revenueGrowth.trend,
      direction: "positive",
      value: current.customer_revenue_cents,
      unit: "cents",
    },
    {
      key: "net_profit_margin",
      label: "Net Profit Margin",
      score: marginScore,
      weight: WEIGHTS.net_profit_margin,
      trend: marginTrend,
      direction: "positive",
      value: marginCurrent,
      unit: "%",
    },
    {
      key: "customer_retention",
      label: "Customer Retention",
      score: retentionScore,
      weight: WEIGHTS.customer_retention,
      trend: retentionScore >= 60 ? "up" : "down",
      direction: "positive",
      value: retentionScore,
      unit: "%",
    },
    {
      key: "cleaner_utilization",
      label: "Cleaner Utilization",
      score: utilizationScore,
      weight: WEIGHTS.cleaner_utilization,
      trend: utilizationScore >= 60 ? "up" : "flat",
      direction: "positive",
      value: Math.round(utilizationPct * 10) / 10,
      unit: "%",
    },
    {
      key: "expense_ratio",
      label: "Expense Ratio",
      score: expenseScore.score,
      weight: WEIGHTS.expense_ratio,
      trend: expenseScore.trend,
      direction: "negative",
      value: expenseRatio,
      unit: "%",
    },
    {
      key: "outstanding_invoices",
      label: "Outstanding Invoices",
      score: outstandingScore,
      weight: WEIGHTS.outstanding_invoices,
      trend: outstandingTrend,
      direction: "negative",
      value: outstandingCents,
      unit: "cents",
    },
    {
      key: "cash_runway",
      label: "Cash Runway",
      score: runwayScore,
      weight: WEIGHTS.cash_runway,
      trend: runwayTrend,
      direction: "positive",
      value: Math.round(runwayMonths * 10) / 10,
      unit: "months",
    },
  ];

  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const overall = clampScore(
    metrics.reduce((sum, m) => sum + (m.score * m.weight) / totalWeight, 0),
  );

  const recommendations: string[] = [];
  if (revenueGrowth.score < 50) recommendations.push("Focus on marketing and conversion to grow revenue.");
  if (marginScore < 50) recommendations.push("Review pricing and cleaner payout ratios to improve margins.");
  if (expenseScore.score < 50) recommendations.push("Audit operating expenses — spending ratio is elevated.");
  if (outstandingScore < 60) recommendations.push("Follow up on overdue customer invoices to improve cash flow.");
  if (runwayScore < 50) recommendations.push("Build cash reserves — runway is below comfortable levels.");
  if (utilizationScore < 50) recommendations.push("Increase cleaner utilization through better dispatch coverage.");
  if (recommendations.length === 0) recommendations.push("Business metrics are healthy — maintain current operations.");

  const statusLabel = statusFromScore(overall);

  const { data: historyRows } = await admin
    .from("business_health_scores")
    .select("score_date, overall_score, status_label")
    .order("score_date", { ascending: false })
    .limit(30);

  return {
    score_date: today,
    overall_score: overall,
    status_label: statusLabel,
    metrics,
    recommendations,
    history: (historyRows ?? []).reverse(),
  };
}

export async function persistBusinessHealthScore(admin: SupabaseClient, scoreDate?: string) {
  const payload = await computeBusinessHealthScore(admin, scoreDate);
  const { error } = await admin.from("business_health_scores").upsert(
    {
      score_date: payload.score_date,
      overall_score: payload.overall_score,
      status_label: payload.status_label,
      metrics: payload.metrics,
      recommendations: payload.recommendations,
      weights: WEIGHTS,
    },
    { onConflict: "score_date" },
  );
  if (error) throw new Error(error.message);
  return payload;
}
