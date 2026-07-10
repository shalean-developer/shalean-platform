import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PromotionAnalyticsSummary = {
  promotionId: string;
  name: string;
  type: string;
  status: string;
  views: number;
  clicks: number;
  bookingsStarted: number;
  bookingsCompleted: number;
  redemptions: number;
  revenueGeneratedZar: number;
  budgetSpentZar: number;
  budgetZar: number | null;
  conversionRate: number;
  roi: number | null;
};

export async function getPromotionsAnalytics(
  admin: SupabaseClient,
  opts?: { from?: string; to?: string; promotionId?: string },
): Promise<{
  summaries: PromotionAnalyticsSummary[];
  totals: {
    views: number;
    clicks: number;
    redemptions: number;
    revenueZar: number;
    discountCostZar: number;
  };
}> {
  let q = admin.from("promotions").select("*").order("revenue_generated_zar", { ascending: false });
  if (opts?.promotionId) q = q.eq("id", opts.promotionId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const summaries: PromotionAnalyticsSummary[] = (data ?? []).map((p) => {
    const views = Number(p.views_count ?? 0);
    const completed = Number(p.bookings_completed_count ?? 0);
    const spent = Number(p.budget_spent_zar ?? 0);
    const revenue = Number(p.revenue_generated_zar ?? 0);
    return {
      promotionId: String(p.id),
      name: String(p.name),
      type: String(p.promotion_type),
      status: String(p.status),
      views,
      clicks: Number(p.clicks_count ?? 0),
      bookingsStarted: Number(p.bookings_started_count ?? 0),
      bookingsCompleted: completed,
      redemptions: Number(p.redemptions_count ?? 0),
      revenueGeneratedZar: revenue,
      budgetSpentZar: spent,
      budgetZar: p.budget_zar != null ? Number(p.budget_zar) : null,
      conversionRate: views > 0 ? completed / views : 0,
      roi: spent > 0 ? (revenue - spent) / spent : null,
    };
  });

  // Optional date-filtered event counts overlay
  if (opts?.from || opts?.to) {
    let eq = admin.from("promotion_events").select("promotion_id, event_type");
    if (opts.from) eq = eq.gte("created_at", opts.from);
    if (opts.to) eq = eq.lte("created_at", opts.to);
    if (opts.promotionId) eq = eq.eq("promotion_id", opts.promotionId);
    const { data: events } = await eq;
    const byPromo: Record<string, Record<string, number>> = {};
    for (const e of events ?? []) {
      const id = String(e.promotion_id);
      byPromo[id] ??= {};
      const t = String(e.event_type);
      byPromo[id]![t] = (byPromo[id]![t] ?? 0) + 1;
    }
    for (const s of summaries) {
      const counts = byPromo[s.promotionId];
      if (!counts) continue;
      s.views = counts.view ?? 0;
      s.clicks = counts.click ?? 0;
      s.bookingsStarted = counts.booking_started ?? 0;
      s.bookingsCompleted = counts.booking_completed ?? 0;
      s.conversionRate = s.views > 0 ? s.bookingsCompleted / s.views : 0;
    }
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      views: acc.views + s.views,
      clicks: acc.clicks + s.clicks,
      redemptions: acc.redemptions + s.redemptions,
      revenueZar: acc.revenueZar + s.revenueGeneratedZar,
      discountCostZar: acc.discountCostZar + s.budgetSpentZar,
    }),
    { views: 0, clicks: 0, redemptions: 0, revenueZar: 0, discountCostZar: 0 },
  );

  return { summaries, totals };
}

export function promotionsAnalyticsToCsv(summaries: PromotionAnalyticsSummary[]): string {
  const headers = [
    "promotion_id",
    "name",
    "type",
    "status",
    "views",
    "clicks",
    "bookings_started",
    "bookings_completed",
    "redemptions",
    "revenue_zar",
    "discount_cost_zar",
    "conversion_rate",
    "roi",
  ];
  const lines = [headers.join(",")];
  for (const s of summaries) {
    lines.push(
      [
        s.promotionId,
        csvEscape(s.name),
        s.type,
        s.status,
        s.views,
        s.clicks,
        s.bookingsStarted,
        s.bookingsCompleted,
        s.redemptions,
        s.revenueGeneratedZar,
        s.budgetSpentZar,
        s.conversionRate.toFixed(4),
        s.roi == null ? "" : s.roi.toFixed(4),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
