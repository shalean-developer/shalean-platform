import {
  inferMarketingChannel,
  MARKETING_CHANNELS,
  mergeSessionChannel,
  type MarketingChannel,
} from "@/lib/admin/marketingAttribution";

export type MarketingEventRow = {
  event_type: string | null;
  booking_id: string | null;
  created_at: string | null;
  payload: Record<string, unknown> | null;
};

export type MarketingSpendRow = {
  channel: string;
  amount: number | null;
  date: string;
};

export type MarketingFunnel = {
  visitors: number;
  started: number;
  viewedPrice: number;
  selectedTime: number;
  completed: number;
};

export type MarketingChannelRow = {
  channel: MarketingChannel;
  spend: number;
  bookings: number;
  revenue: number;
  cpa: number;
  roas: number;
};

export type MarketingSummary = {
  range: "today" | "7d" | "30d";
  kpis: {
    totalAdSpend: number;
    totalBookingsFromAds: number;
    revenueFromAds: number;
    totalAttributedRevenue: number;
    cpa: number;
    roas: number;
  };
  channels: MarketingChannelRow[];
  funnel: MarketingFunnel;
  funnelConversion: {
    visitToStartPct: number;
    startToPricePct: number;
    priceToTimePct: number;
    timeToCompletePct: number;
  };
  roi: {
    profit: number;
    bestChannel: MarketingChannel | null;
    worstChannel: MarketingChannel | null;
  };
  charts: {
    revenueVsSpend: Array<{ date: string; revenue: number; spend: number }>;
    bookingsPerChannel: Array<{ channel: MarketingChannel; bookings: number }>;
  };
  insights: string[];
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, (numerator / denominator) * 100);
}

const FUNNEL_STEPS = ["page_view", "start_booking", "view_price", "select_time", "complete_booking"] as const;
type FunnelStep = (typeof FUNNEL_STEPS)[number];

function sessionIdFromPayload(payload: Record<string, unknown>): string {
  return String(payload.session_id ?? payload.analytics_session_id ?? "");
}

function sessionsReachedStep(sessionFunnel: Map<string, Set<FunnelStep>>, step: FunnelStep): number {
  const idx = FUNNEL_STEPS.indexOf(step);
  if (idx < 0) return 0;
  let count = 0;
  for (const steps of sessionFunnel.values()) {
    for (let i = idx; i < FUNNEL_STEPS.length; i++) {
      if (steps.has(FUNNEL_STEPS[i]!)) {
        count++;
        break;
      }
    }
  }
  return count;
}

export function aggregateMarketingData(input: {
  events: MarketingEventRow[];
  spendRows: MarketingSpendRow[];
  bookingRevenue: Map<string, number>;
  days: number;
  since: Date;
}): MarketingSummary {
  const { events, spendRows, bookingRevenue, days, since } = input;

  const sessionFunnel = new Map<string, Set<FunnelStep>>();
  const sessionsByChannel = new Map<string, MarketingChannel>();
  const channels = new Map<MarketingChannel, { spend: number; bookings: number; revenue: number }>();
  for (const ch of MARKETING_CHANNELS) channels.set(ch, { spend: 0, bookings: 0, revenue: 0 });

  const trend = new Map<string, { spend: number; revenue: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    trend.set(ymd(d), { spend: 0, revenue: 0 });
  }

  for (const ev of events) {
    const type = String(ev.event_type ?? "");
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    const sid = sessionIdFromPayload(payload);
    const date = String(ev.created_at ?? "").slice(0, 10);

    if (sid && FUNNEL_STEPS.includes(type as FunnelStep)) {
      const steps = sessionFunnel.get(sid) ?? new Set<FunnelStep>();
      steps.add(type as FunnelStep);
      sessionFunnel.set(sid, steps);
    }

    if (sid) {
      const channel = inferMarketingChannel(payload);
      sessionsByChannel.set(sid, mergeSessionChannel(sessionsByChannel.get(sid), channel));
    }

    if (type === "complete_booking") {
      const channel =
        sid && sessionsByChannel.has(sid)
          ? sessionsByChannel.get(sid)!
          : inferMarketingChannel(payload);
      const row = channels.get(channel)!;
      row.bookings += 1;
      const revenue = ev.booking_id ? bookingRevenue.get(ev.booking_id) ?? 0 : 0;
      row.revenue += revenue;
      const day = trend.get(date);
      if (day) day.revenue += revenue;
    }
  }

  for (const row of spendRows) {
    const channel = String(row.channel) as MarketingChannel;
    const amount = Number(row.amount ?? 0);
    if (!channels.has(channel) || !Number.isFinite(amount)) continue;
    channels.get(channel)!.spend += amount;
    const day = trend.get(String(row.date));
    if (day) day.spend += amount;
  }

  const funnel: MarketingFunnel = {
    visitors: sessionsReachedStep(sessionFunnel, "page_view"),
    started: sessionsReachedStep(sessionFunnel, "start_booking"),
    viewedPrice: sessionsReachedStep(sessionFunnel, "view_price"),
    selectedTime: sessionsReachedStep(sessionFunnel, "select_time"),
    completed: sessionsReachedStep(sessionFunnel, "complete_booking"),
  };

  const channelRows: MarketingChannelRow[] = MARKETING_CHANNELS.map((channel) => {
    const row = channels.get(channel)!;
    const cpa = row.bookings > 0 ? row.spend / row.bookings : 0;
    const roas = row.spend > 0 ? row.revenue / row.spend : 0;
    return { channel, ...row, cpa, roas };
  });

  const adChannels = channelRows.filter((c) => c.channel === "google_ads" || c.channel === "facebook_ads");
  const totalAdSpend = adChannels.reduce((s, c) => s + c.spend, 0);
  const totalBookingsFromAds = adChannels.reduce((s, c) => s + c.bookings, 0);
  const revenueFromAds = adChannels.reduce((s, c) => s + c.revenue, 0);
  const totalAttributedRevenue = channelRows.reduce((s, c) => s + c.revenue, 0);
  const totalSpend = channelRows.reduce((s, c) => s + c.spend, 0);
  const cpa = totalBookingsFromAds > 0 ? totalAdSpend / totalBookingsFromAds : 0;
  const roas = totalAdSpend > 0 ? revenueFromAds / totalAdSpend : 0;
  const profit = totalAttributedRevenue - totalSpend;

  const paidChannels = channelRows.filter((c) => c.spend > 0);
  const best = paidChannels.length > 0 ? [...paidChannels].sort((a, b) => b.roas - a.roas)[0] ?? null : null;
  const worst =
    paidChannels.length > 1 ? [...paidChannels].sort((a, b) => a.roas - b.roas)[0] ?? null : null;

  const insights: string[] = [];
  if (best && best.roas > 0) {
    insights.push(`${best.channel.replace(/_/g, " ")} has highest ROAS among paid channels`);
  }
  const fb = channelRows.find((c) => c.channel === "facebook_ads");
  const google = channelRows.find((c) => c.channel === "google_ads");
  if (fb && fb.cpa > 0 && google && google.cpa > 0 && fb.cpa > google.cpa) {
    insights.push("Facebook CPA is higher than Google Ads");
  }
  const organic = channelRows.find((c) => c.channel === "organic_seo");
  if (organic && organic.bookings > 0) {
    insights.push(`Organic SEO drove ${organic.bookings} booking${organic.bookings === 1 ? "" : "s"}`);
  }
  if (totalAdSpend === 0 && (google?.bookings ?? 0) + (fb?.bookings ?? 0) > 0) {
    insights.push("Add ad spend records to calculate ROAS and CPA");
  }

  return {
    range: days === 1 ? "today" : days === 30 ? "30d" : "7d",
    kpis: { totalAdSpend, totalBookingsFromAds, revenueFromAds, totalAttributedRevenue, cpa, roas },
    channels: channelRows,
    funnel,
    funnelConversion: {
      visitToStartPct: pct(funnel.started, funnel.visitors),
      startToPricePct: pct(funnel.viewedPrice, funnel.started),
      priceToTimePct: pct(funnel.selectedTime, funnel.viewedPrice),
      timeToCompletePct: pct(funnel.completed, funnel.selectedTime),
    },
    roi: {
      profit,
      bestChannel: best?.channel ?? null,
      worstChannel: worst?.channel ?? null,
    },
    charts: {
      revenueVsSpend: [...trend.entries()].map(([date, v]) => ({ date, ...v })),
      bookingsPerChannel: channelRows.map((c) => ({ channel: c.channel, bookings: c.bookings })),
    },
    insights,
  };
}
