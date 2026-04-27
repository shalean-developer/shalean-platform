import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentLinkChannelStats } from "@/lib/pay/paymentLinkDeliveryStats";
import type { PaymentConversionFunnel } from "@/lib/conversion/conversionDashboardStats";
import { fetchPaymentConversionFunnelRange } from "@/lib/conversion/conversionDashboardStats";

export type TrendDayPoint = {
  date: string;
  first_sent: number;
  paid: number;
  conversion_rate: number;
};

export type EmailTrendDayPoint = {
  date: string;
  attempted: number;
  sent: number;
  success_rate: number;
};

export type ConversionTrendPack = {
  /** Calendar-day series (UTC date `YYYY-MM-DD`), oldest → newest, length ≤ `daysBack`. */
  funnel_by_day: TrendDayPoint[];
  email_channel_by_day: EmailTrendDayPoint[];
  /** Aggregate last 7 calendar days vs prior 7 (same series). */
  summary: {
    last_7d: { first_sent: number; paid: number; conversion_rate: number };
    prior_7d: { first_sent: number; paid: number; conversion_rate: number };
    conversion_delta_pct_points: number | null;
  };
};

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Daily funnel + email attempt trends from raw rows (bounded `limit` for admin cost).
 */
export async function fetchConversionTrendPack(
  admin: SupabaseClient,
  params?: { daysBack?: number; rowLimit?: number },
): Promise<ConversionTrendPack> {
  const daysBack = Math.min(45, Math.max(7, params?.daysBack ?? 30));
  const rowLimit = Math.min(15_000, Math.max(2000, params?.rowLimit ?? 8000));
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 86400000);
  const startIso = start.toISOString();

  const sentByDay = new Map<string, number>();
  const paidByDay = new Map<string, number>();
  const emailAtt = new Map<string, number>();
  const emailOk = new Map<string, number>();

  const { data: bRows } = await admin
    .from("bookings")
    .select("payment_link_first_sent_at, payment_completed_at")
    .not("payment_link_first_sent_at", "is", null)
    .gte("payment_link_first_sent_at", startIso)
    .order("payment_link_first_sent_at", { ascending: false })
    .limit(rowLimit);

  for (const raw of bRows ?? []) {
    const r = raw as { payment_link_first_sent_at?: string; payment_completed_at?: string | null };
    const fs = r.payment_link_first_sent_at;
    if (!fs) continue;
    const day = fs.slice(0, 10);
    sentByDay.set(day, (sentByDay.get(day) ?? 0) + 1);
    if (r.payment_completed_at) {
      paidByDay.set(day, (paidByDay.get(day) ?? 0) + 1);
    }
  }

  const { data: eRows } = await admin
    .from("payment_link_delivery_events")
    .select("created_at, channel, status")
    .eq("channel", "email")
    .gte("created_at", startIso)
    .order("created_at", { ascending: false })
    .limit(rowLimit);

  for (const raw of eRows ?? []) {
    const r = raw as { created_at?: string; channel?: string; status?: string };
    const t = r.created_at;
    if (!t) continue;
    const day = t.slice(0, 10);
    emailAtt.set(day, (emailAtt.get(day) ?? 0) + 1);
    if (String(r.status).toLowerCase() === "sent") {
      emailOk.set(day, (emailOk.get(day) ?? 0) + 1);
    }
  }

  const days: string[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400000);
    days.push(ymdUtc(d));
  }

  const funnel_by_day: TrendDayPoint[] = days.map((date) => {
    const fs = sentByDay.get(date) ?? 0;
    const pd = paidByDay.get(date) ?? 0;
    return {
      date,
      first_sent: fs,
      paid: pd,
      conversion_rate: fs > 0 ? Math.round((1e4 * pd) / fs) / 1e4 : 0,
    };
  });

  const email_channel_by_day: EmailTrendDayPoint[] = days.map((date) => {
    const att = emailAtt.get(date) ?? 0;
    const ok = emailOk.get(date) ?? 0;
    return {
      date,
      attempted: att,
      sent: ok,
      success_rate: att > 0 ? Math.round((1e4 * ok) / att) / 1e4 : 0,
    };
  });

  const sumWindow = (startIdx: number, len: number) => {
    let fs = 0;
    let pd = 0;
    for (let i = startIdx; i < startIdx + len && i < funnel_by_day.length; i++) {
      fs += funnel_by_day[i]!.first_sent;
      pd += funnel_by_day[i]!.paid;
    }
    const rate = fs > 0 ? pd / fs : 0;
    return { first_sent: fs, paid: pd, conversion_rate: rate };
  };

  const n = funnel_by_day.length;
  const last7 = sumWindow(Math.max(0, n - 7), 7);
  const prior7 = sumWindow(Math.max(0, n - 14), 7);
  const conversion_delta_pct_points =
    prior7.conversion_rate > 0
      ? Math.round(10000 * (last7.conversion_rate - prior7.conversion_rate)) / 100
      : last7.conversion_rate > 0
        ? Math.round(last7.conversion_rate * 10000) / 100
        : null;

  return {
    funnel_by_day,
    email_channel_by_day,
    summary: {
      last_7d: last7,
      prior_7d: prior7,
      conversion_delta_pct_points,
    },
  };
}

export type FunnelSegmentRow = {
  key: string;
  label: string;
  first_sent: number;
  paid: number;
  conversion_rate: number;
};

export type FunnelSegmentBreakdown = {
  by_city: FunnelSegmentRow[];
  by_account: FunnelSegmentRow[];
};

/**
 * Segment funnel for cohort first-sent in `[sinceIso, ∞)` (same as main funnel), capped rows.
 */
export async function fetchFunnelSegmentBreakdown(
  admin: SupabaseClient,
  sinceIso: string,
  params?: { rowLimit?: number },
): Promise<FunnelSegmentBreakdown> {
  const rowLimit = Math.min(12_000, Math.max(1500, params?.rowLimit ?? 6000));

  const { data: rows } = await admin
    .from("bookings")
    .select("city_id, user_id, payment_link_first_sent_at, payment_completed_at")
    .not("payment_link_first_sent_at", "is", null)
    .gte("payment_link_first_sent_at", sinceIso)
    .order("payment_link_first_sent_at", { ascending: false })
    .limit(rowLimit);

  const cityAgg = new Map<string, { sent: number; paid: number }>();
  const acctAgg = {
    guest: { sent: 0, paid: 0 },
    signed_in: { sent: 0, paid: 0 },
  };

  const cityIds = new Set<string>();
  for (const raw of rows ?? []) {
    const r = raw as {
      city_id?: string | null;
      user_id?: string | null;
      payment_completed_at?: string | null;
    };
    const paid = Boolean(r.payment_completed_at);
    const cid = r.city_id && String(r.city_id).trim() ? String(r.city_id) : "unknown";
    cityIds.add(cid);
    const c = cityAgg.get(cid) ?? { sent: 0, paid: 0 };
    c.sent++;
    if (paid) c.paid++;
    cityAgg.set(cid, c);

    const bucket = r.user_id && String(r.user_id).trim() ? "signed_in" : "guest";
    acctAgg[bucket].sent++;
    if (paid) acctAgg[bucket].paid++;
  }

  const idList = [...cityIds].filter((id) => id !== "unknown");
  const labels = new Map<string, string>();
  if (idList.length) {
    const { data: cities } = await admin.from("cities").select("id, name").in("id", idList);
    for (const c of cities ?? []) {
      const row = c as { id: string; name: string };
      labels.set(row.id, row.name || row.id);
    }
  }

  const by_city: FunnelSegmentRow[] = [...cityAgg.entries()]
    .map(([key, v]) => ({
      key,
      label: key === "unknown" ? "Unknown city" : labels.get(key) ?? key.slice(0, 8),
      first_sent: v.sent,
      paid: v.paid,
      conversion_rate: v.sent > 0 ? Math.round((1e4 * v.paid) / v.sent) / 1e4 : 0,
    }))
    .sort((a, b) => b.first_sent - a.first_sent)
    .slice(0, 12);

  const by_account: FunnelSegmentRow[] = [
    {
      key: "guest",
      label: "Guest checkout (no user_id)",
      first_sent: acctAgg.guest.sent,
      paid: acctAgg.guest.paid,
      conversion_rate:
        acctAgg.guest.sent > 0 ? Math.round((1e4 * acctAgg.guest.paid) / acctAgg.guest.sent) / 1e4 : 0,
    },
    {
      key: "signed_in",
      label: "Signed-in customer",
      first_sent: acctAgg.signed_in.sent,
      paid: acctAgg.signed_in.paid,
      conversion_rate:
        acctAgg.signed_in.sent > 0
          ? Math.round((1e4 * acctAgg.signed_in.paid) / acctAgg.signed_in.sent) / 1e4
          : 0,
    },
  ];

  return { by_city, by_account };
}

export type ConversionAlert = {
  severity: "warning" | "critical";
  code: string;
  message: string;
};

const EMAIL_SUCCESS_WARN = 0.8;
const CONVERSION_DROP_WARN = 0.1;

/**
 * Rule-based monitoring on snapshot + 7d vs prior-7d funnel.
 */
export function buildConversionDashboardAlerts(params: {
  payment_delivery_stats: PaymentLinkChannelStats;
  payment_funnel: PaymentConversionFunnel;
  week_over_week: {
    last_7d: { first_sent: number; paid: number; conversion_rate: number };
    prior_7d: { first_sent: number; paid: number; conversion_rate: number };
  };
}): ConversionAlert[] {
  const alerts: ConversionAlert[] = [];
  const es = params.payment_delivery_stats.email_success_rate;
  if (es != null && params.payment_delivery_stats.email_attempted >= 20 && es < EMAIL_SUCCESS_WARN) {
    alerts.push({
      severity: es < 0.65 ? "critical" : "warning",
      code: "email_success_below_threshold",
      message: `Email success rate is ${(es * 100).toFixed(1)}% (threshold ${EMAIL_SUCCESS_WARN * 100}%) over ${params.payment_delivery_stats.email_attempted} attempts in sample.`,
    });
  }

  const { last_7d, prior_7d } = params.week_over_week;
  if (prior_7d.first_sent >= 15 && last_7d.first_sent >= 15 && prior_7d.conversion_rate > 0) {
    const relDrop = (prior_7d.conversion_rate - last_7d.conversion_rate) / prior_7d.conversion_rate;
    if (relDrop >= CONVERSION_DROP_WARN) {
      alerts.push({
        severity: relDrop >= 0.2 ? "critical" : "warning",
        code: "cohort_conversion_week_over_week_drop",
        message: `Payment cohort conversion fell ~${(relDrop * 100).toFixed(1)}% vs prior 7 days (${(prior_7d.conversion_rate * 100).toFixed(1)}% → ${(last_7d.conversion_rate * 100).toFixed(1)}%).`,
      });
    }
  }

  if (params.payment_funnel.payment_link_first_sent >= 10 && params.payment_funnel.cohort_payment_conversion_rate < 0.15) {
    alerts.push({
      severity: "warning",
      code: "funnel_conversion_very_low",
      message: `Window cohort conversion is ${(params.payment_funnel.cohort_payment_conversion_rate * 100).toFixed(1)}% — sanity-check pricing, link TTL, and checkout UX.`,
    });
  }

  return alerts;
}

/** Server-side 7d vs prior-7d funnel (exact counts; complements row-based trend). */
export async function fetchWeekOverWeekFunnelSnapshot(admin: SupabaseClient): Promise<{
  last_7d: { first_sent: number; paid: number; conversion_rate: number };
  prior_7d: { first_sent: number; paid: number; conversion_rate: number };
}> {
  const now = Date.now();
  const d7 = new Date(now - 7 * 86400000).toISOString();
  const d14 = new Date(now - 14 * 86400000).toISOString();
  const [last, prior] = await Promise.all([
    fetchPaymentConversionFunnelRange(admin, d7, new Date(now + 1).toISOString()),
    fetchPaymentConversionFunnelRange(admin, d14, d7),
  ]);
  return {
    last_7d: {
      first_sent: last.payment_link_first_sent,
      paid: last.cohort_paid,
      conversion_rate: last.cohort_payment_conversion_rate,
    },
    prior_7d: {
      first_sent: prior.payment_link_first_sent,
      paid: prior.cohort_paid,
      conversion_rate: prior.cohort_payment_conversion_rate,
    },
  };
}
