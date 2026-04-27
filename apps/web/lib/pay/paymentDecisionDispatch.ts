import "server-only";

import type { PaymentConversionBucket } from "@/lib/booking/paymentConversionBucket";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { priorPaymentConversionBucketForCustomer } from "@/lib/pay/priorPaymentConversionBucket";
import {
  decidePaymentLinkAction,
  paymentDecisionEngineDisabled,
  type MessageTarget,
  type PaymentLinkDecision,
  type PaymentLinkDecisionIntent,
  type PaymentRiskLevel,
} from "@/lib/pay/paymentDecisionEngine";
import { aggregatePaymentLinkDeliveryStats, type PaymentLinkChannelStats } from "@/lib/pay/paymentLinkDeliveryStats";
import type { SupabaseClient } from "@supabase/supabase-js";

export type { MessageTarget } from "@/lib/pay/paymentDecisionEngine";

export type PaymentDecisionBookingRow = {
  id: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  payment_link_send_count?: number | null;
  payment_conversion_bucket?: string | null;
  payment_link_first_sent_at?: string | null;
  payment_link_delivery?: unknown;
  payment_last_touch_channel?: string | null;
};

export async function fetchRecentPaymentLinkChannelStats(
  admin: SupabaseClient,
  limit = 200,
): Promise<PaymentLinkChannelStats> {
  const { data, error } = await admin
    .from("bookings")
    .select("payment_link_delivery")
    .not("payment_link_delivery", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return aggregatePaymentLinkDeliveryStats([]);
  }
  return aggregatePaymentLinkDeliveryStats(data ?? []);
}

export async function resolvePaymentLinkDispatchDecision(
  admin: SupabaseClient,
  row: PaymentDecisionBookingRow,
  opts: {
    intent: PaymentLinkDecisionIntent;
    notificationMode: "chain" | "chain_plus_email";
    /** Payment-link dispatch is customer-facing; override only for non-customer experiments. */
    target?: MessageTarget;
    channelStats?: PaymentLinkChannelStats | null;
    priorCache?: Map<string, PaymentConversionBucket | null>;
  },
): Promise<PaymentLinkDecision> {
  const cache = opts.priorCache ?? new Map();
  const priorPaymentConversionBucket = await priorPaymentConversionBucketForCustomer(
    admin,
    { emailRaw: row.customer_email, phoneRaw: row.customer_phone, excludeBookingId: row.id },
    cache,
  );
  const channelStats = opts.channelStats ?? (await fetchRecentPaymentLinkChannelStats(admin));
  return decidePaymentLinkAction({
    intent: opts.intent,
    notificationMode: opts.notificationMode,
    hasPhone: Boolean(String(row.customer_phone ?? "").trim()),
    hasEmail: Boolean(String(row.customer_email ?? "").trim()),
    target: opts.target ?? "customer",
    priorPaymentConversionBucket,
    channelStats,
    booking: {
      payment_link_send_count: row.payment_link_send_count,
      payment_conversion_bucket: row.payment_conversion_bucket,
      payment_link_first_sent_at: row.payment_link_first_sent_at,
      payment_link_delivery: row.payment_link_delivery,
      payment_last_touch_channel: row.payment_last_touch_channel,
    },
    nowMs: Date.now(),
  });
}

export type PaymentDecisionEngineLogPayload = {
  booking_id: string;
  message_target: MessageTarget;
  chosen_channels: ("whatsapp" | "sms" | "email")[];
  phone_try_order: ("whatsapp" | "sms")[];
  risk_level: PaymentRiskLevel;
  reason: string;
  intent: PaymentLinkDecisionIntent;
  escalate: boolean;
  send_now: boolean;
};

export async function logPaymentDecisionEngineEvent(payload: PaymentDecisionEngineLogPayload): Promise<void> {
  await logSystemEvent({
    level: "info",
    source: "payment_decision_engine",
    message: "payment_decision_engine",
    context: {
      type: "payment_decision_engine",
      ...payload,
    },
  });
}

export async function persistPaymentDecisionSnapshot(
  admin: SupabaseClient,
  bookingId: string,
  snapshot: Record<string, unknown>,
  bookingPriority?: "normal" | "high",
): Promise<void> {
  const patch: Record<string, unknown> = { last_decision_snapshot: snapshot };
  if (bookingPriority === "high") patch.booking_priority = "high";
  const { error } = await admin.from("bookings").update(patch).eq("id", bookingId);
  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "payment_decision_engine",
      message: "persist_decision_snapshot_failed",
      context: { booking_id: bookingId, error: error.message },
    });
  }
}

/** Logs + optional DB snapshot when the engine is enabled. Never throws. */
export async function recordPaymentLinkDecision(
  admin: SupabaseClient,
  row: PaymentDecisionBookingRow,
  decision: PaymentLinkDecision,
  intent: PaymentLinkDecisionIntent,
): Promise<void> {
  await logPaymentDecisionEngineEvent({
    booking_id: row.id,
    message_target: decision.target,
    chosen_channels: decision.channels,
    phone_try_order: decision.phoneTryOrder,
    risk_level: decision.risk_level,
    reason: decision.reason,
    intent,
    escalate: decision.escalate,
    send_now: decision.send_now,
  });
  if (paymentDecisionEngineDisabled()) return;
  await persistPaymentDecisionSnapshot(
    admin,
    row.id,
    {
      at: new Date().toISOString(),
      intent,
      target: decision.target,
      channels: decision.channels,
      phone_try_order: decision.phoneTryOrder,
      risk_level: decision.risk_level,
      escalate: decision.escalate,
      send_now: decision.send_now,
      reason: decision.reason,
    },
    decision.risk_level === "high" ? "high" : undefined,
  );
}
