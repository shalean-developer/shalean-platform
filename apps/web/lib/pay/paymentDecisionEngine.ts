import type { PaymentConversionBucket } from "@/lib/booking/paymentConversionBucket";
import type { PaymentLinkChannelStats } from "@/lib/pay/paymentLinkDeliveryStats";

/** Relative unit cost for ordering (WhatsApp cheap, SMS expensive, email ~free). */
export const CHANNEL_UNIT_COST: Record<"whatsapp" | "sms" | "email", number> = {
  whatsapp: 1,
  sms: 4,
  email: 0.05,
};

export type PaymentRiskLevel = "low" | "medium" | "high";

export type PaymentLinkDecisionIntent = "initial_send" | "reminder" | "admin_resend";

export type PaymentLinkDeliveryChannelState = "sent" | "failed" | "skipped" | null;

export type PaymentLinkDecision = {
  /** Phone + email channels relevant to this wave (email only when it may be sent per mode). */
  channels: ("whatsapp" | "sms" | "email")[];
  phoneTryOrder: ("whatsapp" | "sms")[];
  send_now: boolean;
  delay_minutes?: number;
  escalate: boolean;
  risk_level: PaymentRiskLevel;
  reason: string;
};

export function paymentDecisionEngineDisabled(): boolean {
  return process.env.PAYMENT_DECISION_ENGINE_DISABLED === "true";
}

export function parsePaymentLinkDeliveryChannels(raw: unknown): {
  whatsapp: PaymentLinkDeliveryChannelState;
  sms: PaymentLinkDeliveryChannelState;
  email: PaymentLinkDeliveryChannelState;
} {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const n = (k: string): PaymentLinkDeliveryChannelState => {
    const v = String(d[k] ?? "").toLowerCase();
    if (v === "sent" || v === "failed" || v === "skipped") return v;
    return null;
  };
  return { whatsapp: n("whatsapp"), sms: n("sms"), email: n("email") };
}

export function deliveryHasSuccessfulSend(ch: {
  whatsapp: PaymentLinkDeliveryChannelState;
  sms: PaymentLinkDeliveryChannelState;
  email: PaymentLinkDeliveryChannelState;
}): boolean {
  return ch.whatsapp === "sent" || ch.sms === "sent" || ch.email === "sent";
}

export function minutesSinceIso(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (nowMs - t) / 60_000);
}

/** Ensures both phone channels appear once, preserving preferred order first. */
export function normalizePhoneTryOrder(order: ("whatsapp" | "sms")[]): ("whatsapp" | "sms")[] {
  const seen = new Set<"whatsapp" | "sms">();
  const out: ("whatsapp" | "sms")[] = [];
  for (const c of order) {
    if (c !== "whatsapp" && c !== "sms") continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  for (const c of ["whatsapp", "sms"] as const) {
    if (!seen.has(c)) out.push(c);
  }
  return out;
}

const DEFAULT_WA = 0.88;
const DEFAULT_SMS_RESCUE = 0.38;

/**
 * Cost-aware ordering of phone channels. Always returns a permutation of WhatsApp + SMS;
 * delivery layer appends missing fallbacks so nothing is dropped.
 */
export function selectOptimalChannelStrategy(input: {
  channelStats: PaymentLinkChannelStats;
  priorPaymentConversionBucket: PaymentConversionBucket | null;
  paymentLastTouchChannel?: string | null;
}): ("whatsapp" | "sms")[] {
  const wa = input.channelStats.whatsapp_success_rate ?? DEFAULT_WA;
  const smsRescue = input.channelStats.sms_fallback_rate ?? DEFAULT_SMS_RESCUE;
  const lowSample = input.channelStats.sample_size < 20;
  const waCost = CHANNEL_UNIT_COST.whatsapp;
  const smsCost = CHANNEL_UNIT_COST.sms;
  const smsFirstGuess = Math.min(0.9, Math.max(0.22, (1 - wa) * (0.5 + smsRescue * 1.1)));
  const waScore = wa / waCost;
  const smsScore = smsFirstGuess / smsCost;

  if (!lowSample && wa < 0.65) {
    return ["sms", "whatsapp"];
  }
  if (
    String(input.paymentLastTouchChannel ?? "").toLowerCase() === "sms" &&
    !lowSample &&
    smsScore >= waScore * 0.85
  ) {
    return ["sms", "whatsapp"];
  }
  if (
    !lowSample &&
    (input.priorPaymentConversionBucket === "slow" || input.priorPaymentConversionBucket === "medium") &&
    wa < 0.78 &&
    smsScore >= waScore * 0.88
  ) {
    return ["sms", "whatsapp"];
  }
  return ["whatsapp", "sms"];
}

export function predictPaymentRisk(input: {
  payment_link_send_count: number;
  payment_conversion_bucket: string | null | undefined;
  priorPaymentConversionBucket: PaymentConversionBucket | null;
  payment_link_first_sent_at: string | null | undefined;
  payment_link_delivery: unknown;
  nowMs: number;
}): { risk_level: PaymentRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const ch = parsePaymentLinkDeliveryChannels(input.payment_link_delivery);
  const hadSend = deliveryHasSuccessfulSend(ch);
  const sendCount = Math.max(0, Math.floor(Number(input.payment_link_send_count) || 0));
  const minsFirst = minutesSinceIso(input.payment_link_first_sent_at ?? null, input.nowMs);

  if (input.priorPaymentConversionBucket === "instant") {
    reasons.push("prior_instant_payer");
    return { risk_level: "low", reasons };
  }

  if (sendCount >= 2 && !hadSend) {
    reasons.push("multi_send_no_channel_success");
    return { risk_level: "high", reasons };
  }

  if (sendCount >= 1 && !hadSend && minsFirst != null && minsFirst >= 45) {
    reasons.push("no_delivery_success_after_first_send");
    if (minsFirst >= 120 || input.priorPaymentConversionBucket === "slow") {
      return { risk_level: "high", reasons };
    }
    return { risk_level: "medium", reasons };
  }

  if (
    (input.priorPaymentConversionBucket === "slow" || input.priorPaymentConversionBucket === "medium") &&
    minsFirst != null &&
    minsFirst >= 90 &&
    !hadSend
  ) {
    reasons.push("slow_payer_profile_no_success_yet");
    return { risk_level: "medium", reasons };
  }

  const selfBucket = String(input.payment_conversion_bucket ?? "").toLowerCase();
  if (selfBucket === "slow" && minsFirst != null && minsFirst >= 60 && !hadSend) {
    reasons.push("booking_tagged_slow_no_success");
    return { risk_level: "medium", reasons };
  }

  reasons.push("default");
  return { risk_level: "low", reasons };
}

export function decidePaymentLinkAction(ctx: {
  intent: PaymentLinkDecisionIntent;
  notificationMode: "chain" | "chain_plus_email";
  hasPhone: boolean;
  hasEmail: boolean;
  priorPaymentConversionBucket: PaymentConversionBucket | null;
  channelStats: PaymentLinkChannelStats;
  booking: {
    payment_link_send_count?: number | null;
    payment_conversion_bucket?: string | null;
    payment_link_first_sent_at?: string | null;
    payment_link_delivery?: unknown;
    payment_last_touch_channel?: string | null;
  };
  nowMs: number;
}): PaymentLinkDecision {
  const disabled = paymentDecisionEngineDisabled();
  const rawOrder = disabled
    ? (["whatsapp", "sms"] as ("whatsapp" | "sms")[])
    : selectOptimalChannelStrategy({
        channelStats: ctx.channelStats,
        priorPaymentConversionBucket: ctx.priorPaymentConversionBucket,
        paymentLastTouchChannel: ctx.booking.payment_last_touch_channel,
      });
  const phoneTryOrder = ctx.hasPhone ? normalizePhoneTryOrder(rawOrder) : [];

  const risk = predictPaymentRisk({
    payment_link_send_count: Number(ctx.booking.payment_link_send_count ?? 0),
    payment_conversion_bucket: ctx.booking.payment_conversion_bucket,
    priorPaymentConversionBucket: ctx.priorPaymentConversionBucket,
    payment_link_first_sent_at: ctx.booking.payment_link_first_sent_at ?? null,
    payment_link_delivery: ctx.booking.payment_link_delivery,
    nowMs: ctx.nowMs,
  });

  const emailMaySend =
    ctx.hasEmail &&
    (ctx.notificationMode === "chain_plus_email" ||
      !ctx.hasPhone ||
      ctx.notificationMode === "chain");
  const channels: ("whatsapp" | "sms" | "email")[] = [...phoneTryOrder];
  if (emailMaySend && !channels.includes("email")) channels.push("email");

  const escalate = risk.risk_level === "high";
  let send_now = true;
  let delay_minutes: number | undefined;

  if (ctx.intent === "reminder" && risk.risk_level === "low" && ctx.priorPaymentConversionBucket === "fast") {
    send_now = true;
    delay_minutes = 0;
  }

  const reasonParts = [
    `intent=${ctx.intent}`,
    `risk=${risk.risk_level}`,
    `phone=${phoneTryOrder.join("→")}`,
    `mode=${ctx.notificationMode}`,
    ...risk.reasons.map((r) => `risk_rule:${r}`),
  ];
  if (disabled) reasonParts.push("engine_disabled");

  return {
    channels,
    phoneTryOrder,
    send_now,
    delay_minutes,
    escalate,
    risk_level: risk.risk_level,
    reason: reasonParts.join(" | "),
  };
}
