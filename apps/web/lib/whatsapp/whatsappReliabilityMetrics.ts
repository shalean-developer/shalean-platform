import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversionAlert } from "@/lib/conversion/conversionDashboardAdvanced";

export type WhatsappChannelMetrics = {
  messages_sent: number;
  messages_delivered: number;
  messages_read: number;
  messages_failed: number;
  delivery_rate: number | null;
  read_rate: number | null;
};

export type WhatsappDispatchFunnelMetrics = {
  offers_whatsapp_sent: number;
  offers_replied: number;
  offers_accepted: number;
  offers_declined: number;
  offers_with_read_receipt: number;
  reply_rate: number | null;
  accept_rate: number | null;
  read_receipt_rate: number | null;
  avg_response_latency_ms: number | null;
};

export type WhatsappCleanerResponsivenessRow = {
  cleaner_id: string;
  offers_count: number;
  avg_response_latency_ms: number | null;
  read_rate: number | null;
  accept_rate: number | null;
  ignore_rate: number | null;
};

export type WhatsappDashboardMetrics = {
  since: string;
  channel: WhatsappChannelMetrics;
  dispatch: WhatsappDispatchFunnelMetrics;
  cleaner_responsiveness_sample: WhatsappCleanerResponsivenessRow[];
};

type RpcPayload = {
  since?: string;
  channel?: Partial<WhatsappChannelMetrics>;
  dispatch?: Partial<WhatsappDispatchFunnelMetrics>;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchWhatsappDashboardMetrics(
  admin: SupabaseClient,
  sinceIso: string,
  options?: { untilIso?: string | null },
): Promise<WhatsappDashboardMetrics> {
  const rpcArgs =
    options?.untilIso != null && options.untilIso !== ""
      ? { p_since: sinceIso, p_until: options.untilIso }
      : { p_since: sinceIso };
  const { data, error } = await admin.rpc("admin_whatsapp_reliability_metrics", rpcArgs);
  if (error) {
    console.error("[fetchWhatsappDashboardMetrics] rpc failed", error.message);
  }
  const raw = (data ?? {}) as RpcPayload;
  const ch = raw.channel ?? {};
  const disp = raw.dispatch ?? {};

  const channel: WhatsappChannelMetrics = {
    messages_sent: num(ch.messages_sent),
    messages_delivered: num(ch.messages_delivered),
    messages_read: num(ch.messages_read),
    messages_failed: num(ch.messages_failed),
    delivery_rate: numOrNull(ch.delivery_rate),
    read_rate: numOrNull(ch.read_rate),
  };

  const dispatch: WhatsappDispatchFunnelMetrics = {
    offers_whatsapp_sent: num(disp.offers_whatsapp_sent),
    offers_replied: num(disp.offers_replied),
    offers_accepted: num(disp.offers_accepted),
    offers_declined: num(disp.offers_declined),
    offers_with_read_receipt: num(disp.offers_with_read_receipt),
    reply_rate: numOrNull(disp.reply_rate),
    accept_rate: numOrNull(disp.accept_rate),
    read_receipt_rate: numOrNull(disp.read_receipt_rate),
    avg_response_latency_ms: numOrNull(disp.avg_response_latency_ms),
  };

  const cleaner_responsiveness_sample = await fetchCleanerResponsivenessSample(admin, sinceIso, options?.untilIso);

  return {
    since: typeof raw.since === "string" ? raw.since : sinceIso,
    channel,
    dispatch,
    cleaner_responsiveness_sample,
  };
}

async function fetchCleanerResponsivenessSample(
  admin: SupabaseClient,
  sinceIso: string,
  untilIso?: string | null,
): Promise<WhatsappCleanerResponsivenessRow[]> {
  let q = admin
    .from("dispatch_offers")
    .select("cleaner_id, status, response_latency_ms, first_read_at, whatsapp_sent_at")
    .not("whatsapp_sent_at", "is", null)
    .gte("whatsapp_sent_at", sinceIso);
  if (untilIso != null && untilIso !== "") {
    q = q.lt("whatsapp_sent_at", untilIso);
  }
  const { data, error } = await q.order("whatsapp_sent_at", { ascending: false }).limit(8000);

  if (error || !data?.length) return [];

  type Row = {
    cleaner_id?: string;
    status?: string;
    response_latency_ms?: number | null;
    first_read_at?: string | null;
  };

  const byCleaner = new Map<
    string,
    {
      n: number;
      latSum: number;
      latN: number;
      readN: number;
      accepted: number;
      rejected: number;
      expired: number;
    }
  >();

  for (const raw of data as Row[]) {
    const cid = String(raw.cleaner_id ?? "");
    if (!cid) continue;
    let g = byCleaner.get(cid);
    if (!g) {
      g = { n: 0, latSum: 0, latN: 0, readN: 0, accepted: 0, rejected: 0, expired: 0 };
      byCleaner.set(cid, g);
    }
    g.n += 1;
    if (raw.first_read_at) g.readN += 1;
    const lat = raw.response_latency_ms;
    if (typeof lat === "number" && Number.isFinite(lat)) {
      g.latSum += lat;
      g.latN += 1;
    }
    const st = String(raw.status ?? "").toLowerCase();
    if (st === "accepted") g.accepted += 1;
    else if (st === "rejected") g.rejected += 1;
    else if (st === "expired") g.expired += 1;
  }

  const rows: WhatsappCleanerResponsivenessRow[] = [...byCleaner.entries()].map(([cleaner_id, g]) => {
    const decided = g.accepted + g.rejected;
    const avg_response_latency_ms = g.latN > 0 ? Math.round(g.latSum / g.latN) : null;
    const read_rate = g.n > 0 ? Math.round((1e4 * g.readN) / g.n) / 1e4 : null;
    const accept_rate = decided > 0 ? Math.round((1e4 * g.accepted) / decided) / 1e4 : null;
    const ignore_rate = g.n > 0 ? Math.round((1e4 * g.expired) / g.n) / 1e4 : null;
    return {
      cleaner_id,
      offers_count: g.n,
      avg_response_latency_ms,
      read_rate,
      accept_rate,
      ignore_rate,
    };
  });

  rows.sort((a, b) => b.offers_count - a.offers_count);
  return rows.slice(0, 25);
}

const DELIVERY_WARN = 0.8;
const READ_WARN = 0.7;
const ACCEPT_WARN = 0.35;
const ACCEPT_DROP_WARN = 0.12;

export function buildWhatsappReliabilityAlerts(params: {
  current: WhatsappDashboardMetrics;
  prior?: WhatsappDashboardMetrics | null;
}): ConversionAlert[] {
  const alerts: ConversionAlert[] = [];
  const { channel, dispatch } = params.current;
  const minMsgs = 40;
  const minOffers = 25;

  if (channel.messages_sent >= minMsgs && channel.delivery_rate != null && channel.delivery_rate < DELIVERY_WARN) {
    alerts.push({
      severity: channel.delivery_rate < 0.65 ? "critical" : "warning",
      code: "whatsapp_delivery_rate_low",
      message: `WhatsApp delivery rate is ${(channel.delivery_rate * 100).toFixed(1)}% (threshold ${DELIVERY_WARN * 100}%) over ${channel.messages_sent} sent messages in window.`,
    });
  }

  if (
    channel.messages_delivered >= minMsgs &&
    channel.read_rate != null &&
    channel.read_rate < READ_WARN
  ) {
    alerts.push({
      severity: channel.read_rate < 0.5 ? "critical" : "warning",
      code: "whatsapp_read_rate_low",
      message: `WhatsApp read rate is ${(channel.read_rate * 100).toFixed(1)}% (threshold ${READ_WARN * 100}%) among delivered messages in window.`,
    });
  }

  if (dispatch.offers_whatsapp_sent >= minOffers && dispatch.accept_rate != null && dispatch.accept_rate < ACCEPT_WARN) {
    alerts.push({
      severity: "warning",
      code: "whatsapp_offer_accept_rate_low",
      message: `Dispatch offer accept rate is ${(dispatch.accept_rate * 100).toFixed(1)}% over ${dispatch.offers_whatsapp_sent} WhatsApp offers in window.`,
    });
  }

  const prior = params.prior;
  if (
    prior &&
    dispatch.offers_whatsapp_sent >= minOffers &&
    prior.dispatch.offers_whatsapp_sent >= minOffers &&
    prior.dispatch.accept_rate != null &&
    prior.dispatch.accept_rate > 0 &&
    dispatch.accept_rate != null
  ) {
    const relDrop = (prior.dispatch.accept_rate - dispatch.accept_rate) / prior.dispatch.accept_rate;
    if (relDrop >= ACCEPT_DROP_WARN) {
      alerts.push({
        severity: relDrop >= 0.25 ? "critical" : "warning",
        code: "whatsapp_offer_accept_rate_week_over_week_drop",
        message: `Dispatch offer accept rate fell ~${(relDrop * 100).toFixed(1)}% vs prior window (${(prior.dispatch.accept_rate * 100).toFixed(1)}% → ${(dispatch.accept_rate * 100).toFixed(1)}%).`,
      });
    }
  }

  return alerts;
}

/** Same calendar span as [sinceIso, now), but immediately before sinceIso (for WoW-style alerts). */
export async function fetchWhatsappDashboardMetricsPriorWindow(
  admin: SupabaseClient,
  sinceIso: string,
): Promise<WhatsappDashboardMetrics | null> {
  const sinceMs = new Date(sinceIso).getTime();
  if (!Number.isFinite(sinceMs)) return null;
  const span = Math.max(60_000, Date.now() - sinceMs);
  const priorSince = new Date(sinceMs - span).toISOString();
  return fetchWhatsappDashboardMetrics(admin, priorSince, { untilIso: sinceIso });
}
