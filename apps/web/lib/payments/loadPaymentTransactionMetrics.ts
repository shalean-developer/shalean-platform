import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentGateway } from "@/lib/payments/paymentTransactionTypes";

export type PaymentTransactionPeriodMetrics = {
  gross_cents: number;
  processing_fee_cents: number;
  net_settlement_cents: number;
  transaction_count: number;
};

export async function loadPaymentTransactionMetrics(
  admin: SupabaseClient,
  from: string,
  to: string,
  opts?: { gateway?: PaymentGateway; branchId?: string },
): Promise<PaymentTransactionPeriodMetrics> {
  let query = admin
    .from("payment_transactions")
    .select("amount_cents, processing_fee_cents, net_settlement_cents, booking_id")
    .gte("paid_at", `${from}T00:00:00`)
    .lte("paid_at", `${to}T23:59:59`);

  if (opts?.gateway) query = query.eq("gateway", opts.gateway);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = data ?? [];
  if (opts?.branchId) {
    const bookingIds = rows.map((r) => r.booking_id).filter(Boolean) as string[];
    if (bookingIds.length === 0) {
      rows = [];
    } else {
      const { data: bookings } = await admin
        .from("bookings")
        .select("id")
        .in("id", bookingIds)
        .eq("city_id", opts.branchId);
      const allowed = new Set((bookings ?? []).map((b) => b.id));
      rows = rows.filter((r) => r.booking_id && allowed.has(r.booking_id));
    }
  }

  return {
    gross_cents: rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0),
    processing_fee_cents: rows.reduce((s, r) => s + (r.processing_fee_cents ?? 0), 0),
    net_settlement_cents: rows.reduce((s, r) => s + (r.net_settlement_cents ?? 0), 0),
    transaction_count: rows.length,
  };
}
