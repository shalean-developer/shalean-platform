import "server-only";

import type { AdminPaymentLinkDeliveryResult } from "@/lib/admin/adminPaymentLinkDelivery";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentLinkPassType =
  | "admin_initial"
  | "admin_resend"
  | "reminder_1h"
  | "reminder_15m"
  | "unknown";

export type PaymentLinkDeliveryChannel = "whatsapp" | "sms" | "email";

export type ConversionChannel = PaymentLinkDeliveryChannel;

export type PaymentAttributionTouches = {
  firstTouch: ConversionChannel | null;
  lastTouch: ConversionChannel | null;
  /** Ordered unique channels strictly between first and last successful sends. */
  assistChannels: ConversionChannel[];
};

function parseSentChannel(v: unknown): ConversionChannel | null {
  const ch = String(v ?? "").toLowerCase();
  if (ch === "whatsapp" || ch === "sms" || ch === "email") return ch;
  return null;
}

function orderedUniqueChannels(channels: ConversionChannel[]): ConversionChannel[] {
  const seen = new Set<ConversionChannel>();
  const out: ConversionChannel[] = [];
  for (const c of channels) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Pure multi-touch split from chronological successful channel list. */
export function paymentAttributionFromSentChannelList(channels: ConversionChannel[]): PaymentAttributionTouches {
  if (!channels.length) return { firstTouch: null, lastTouch: null, assistChannels: [] };
  const firstTouch = channels[0] ?? null;
  const lastTouch = channels[channels.length - 1] ?? null;
  if (channels.length <= 2) {
    return { firstTouch, lastTouch, assistChannels: [] };
  }
  const middle = channels.slice(1, -1);
  return { firstTouch, lastTouch, assistChannels: orderedUniqueChannels(middle) };
}

/** Map `payment_link_delivery.pass` strings to typed pass_type for events. */
export function resolvePaymentLinkPassType(extra: {
  passType?: PaymentLinkPassType;
  pass?: unknown;
} | null | undefined): PaymentLinkPassType {
  if (extra?.passType) return extra.passType;
  const p = typeof extra?.pass === "string" ? extra.pass.trim() : "";
  if (p === "reminder_1h" || p === "reminder_15m") return p;
  if (p === "admin_resend") return "admin_resend";
  return "unknown";
}

export function buildPaymentLinkDeliveryEventRows(
  bookingId: string,
  result: AdminPaymentLinkDeliveryResult,
  passType: PaymentLinkPassType,
): Array<{ booking_id: string; channel: PaymentLinkDeliveryChannel; status: "sent" | "failed"; pass_type: string }> {
  const rows: Array<{
    booking_id: string;
    channel: PaymentLinkDeliveryChannel;
    status: "sent" | "failed";
    pass_type: string;
  }> = [];
  for (const ch of ["whatsapp", "sms", "email"] as const) {
    const o = result.byChannel[ch];
    if (o === "skipped") continue;
    rows.push({ booking_id: bookingId, channel: ch, status: o, pass_type: passType });
  }
  return rows;
}

export async function insertPaymentLinkDeliveryEvents(
  admin: SupabaseClient,
  bookingId: string,
  result: AdminPaymentLinkDeliveryResult,
  passType: PaymentLinkPassType,
): Promise<void> {
  const rows = buildPaymentLinkDeliveryEventRows(bookingId, result, passType);
  if (!rows.length) return;
  const { error } = await admin.from("payment_link_delivery_events").insert(rows);
  if (error) {
    await reportOperationalIssue("warn", "payment_link_delivery_events", error.message, {
      bookingId,
      passType,
      rowCount: rows.length,
    });
  }
}

export async function resolvePaymentAttributionTouches(
  admin: SupabaseClient,
  bookingId: string,
): Promise<PaymentAttributionTouches> {
  const { data: rows, error } = await admin
    .from("payment_link_delivery_events")
    .select("channel")
    .eq("booking_id", bookingId)
    .eq("status", "sent")
    .order("created_at", { ascending: true });

  if (error || !rows?.length) {
    return { firstTouch: null, lastTouch: null, assistChannels: [] };
  }
  const channels = (rows as { channel?: string }[])
    .map((r) => parseSentChannel(r.channel))
    .filter((c): c is ConversionChannel => c != null);
  return paymentAttributionFromSentChannelList(channels);
}

/** Last successful outbound channel (same as `resolvePaymentAttributionTouches`.lastTouch). */
export async function resolveLastSentConversionChannel(
  admin: SupabaseClient,
  bookingId: string,
): Promise<ConversionChannel | null> {
  const t = await resolvePaymentAttributionTouches(admin, bookingId);
  return t.lastTouch;
}
