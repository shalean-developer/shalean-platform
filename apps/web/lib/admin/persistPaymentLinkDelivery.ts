import "server-only";

import type { AdminPaymentLinkDeliveryResult } from "@/lib/admin/adminPaymentLinkDelivery";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  insertPaymentLinkDeliveryEvents,
  resolvePaymentLinkPassType,
  type PaymentLinkPassType,
} from "@/lib/pay/paymentLinkDeliveryEvents";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentLinkDeliveryJson = {
  whatsapp?: "sent" | "failed" | "skipped";
  sms?: "sent" | "failed" | "skipped";
  email?: "sent" | "failed" | "skipped";
  updated_at?: string;
  /** Optional cron / reminder pass marker */
  pass?: string;
};

function toChannelMap(r: AdminPaymentLinkDeliveryResult): PaymentLinkDeliveryJson {
  return {
    whatsapp: r.byChannel.whatsapp,
    sms: r.byChannel.sms,
    email: r.byChannel.email,
    updated_at: new Date().toISOString(),
  };
}

export type PersistPaymentLinkDeliveryOptions = Partial<PaymentLinkDeliveryJson> & {
  /** When false (e.g. cron reminders), do not bump `payment_link_last_sent_at` so admin resend cooldown is unaffected. */
  touchLastSentAt?: boolean;
  /** Wave label for `payment_link_delivery_events` (preferred over legacy `pass`). */
  passType?: PaymentLinkPassType;
};

export async function persistPaymentLinkDelivery(
  admin: SupabaseClient,
  bookingId: string,
  result: AdminPaymentLinkDeliveryResult,
  extra?: PersistPaymentLinkDeliveryOptions,
): Promise<void> {
  const { touchLastSentAt, passType, ...mergeExtra } = extra ?? {};
  const passResolved = resolvePaymentLinkPassType({ passType, pass: mergeExtra.pass });

  const { data: row } = await admin.from("bookings").select("payment_link_delivery").eq("id", bookingId).maybeSingle();
  const prev =
    row && typeof row === "object" && "payment_link_delivery" in row && row.payment_link_delivery != null
      ? (row.payment_link_delivery as Record<string, unknown>)
      : {};
  const next: PaymentLinkDeliveryJson = {
    ...(typeof prev === "object" && prev !== null && !Array.isArray(prev) ? (prev as PaymentLinkDeliveryJson) : {}),
    ...toChannelMap(result),
    ...mergeExtra,
  };

  const { error: rpcErr } = await admin.rpc("bookings_record_payment_link_delivery", {
    p_booking_id: bookingId,
    p_payment_link_delivery: next as unknown as Record<string, unknown>,
    p_touch_last_sent_at: touchLastSentAt !== false,
  });
  if (rpcErr) {
    await reportOperationalIssue("error", "persistPaymentLinkDelivery", rpcErr.message, { bookingId });
    throw new Error(`payment_link_delivery_persist_failed: ${rpcErr.message}`);
  }

  await insertPaymentLinkDeliveryEvents(admin, bookingId, result, passResolved);
}
