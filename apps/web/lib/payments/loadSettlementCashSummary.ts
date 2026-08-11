import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SettlementCashSummary = {
  from: string;
  to: string;
  gross_collected_cents: number;
  processing_fees_cents: number;
  net_expected_cents: number;
  settled_to_bank_cents: number;
  /** Pending rows with a real Paystack transaction id. Conservative cash-in-transit signal. */
  in_transit_cents: number;
  in_transit_count: number;
  /** Legacy/backfilled pending rows without a gateway transaction id. Never treat as spendable cash. */
  unverified_pending_cents: number;
  unverified_pending_count: number;
  failed_settlement_cents: number;
  reversed_cents: number;
  stale_pending_cents: number;
  stale_pending_count: number;
  transaction_count: number;
  by_status: Record<string, { count: number; net_cents: number }>;
};

function zeroStatus() {
  return { count: 0, net_cents: 0 };
}

/**
 * Reads payment-ledger cash by bank-settlement state. `settled_to_bank_cents` is
 * the only Paystack amount that should be treated as confirmed bank cash.
 *
 * Historical monthly-invoice backfills created synthetic `payment_transactions`
 * without a Paystack transaction id. Those rows remain useful accounting evidence,
 * but must not inflate the operational "Paystack processing" amount. Therefore
 * `in_transit_cents` includes only pending rows with a gateway transaction id.
 */
export async function loadSettlementCashSummary(
  admin: SupabaseClient,
  params: { from: string; to: string; staleAfterDays?: number; now?: Date },
): Promise<SettlementCashSummary> {
  const staleAfterDays = Math.max(1, Math.floor(params.staleAfterDays ?? 4));
  const now = params.now ?? new Date();
  const staleCutoff = new Date(now.getTime() - staleAfterDays * 86_400_000).getTime();

  const { data, error } = await admin
    .from("payment_transactions")
    .select(
      "amount_cents, processing_fee_cents, net_settlement_cents, settlement_status, paid_at, gateway_transaction_id",
    )
    .eq("gateway", "paystack")
    .gte("paid_at", `${params.from}T00:00:00.000Z`)
    .lte("paid_at", `${params.to}T23:59:59.999Z`);
  if (error) throw new Error(error.message);

  const byStatus: Record<string, { count: number; net_cents: number }> = {
    pending: zeroStatus(),
    settled: zeroStatus(),
    failed: zeroStatus(),
    reversed: zeroStatus(),
  };

  let gross = 0;
  let fees = 0;
  let net = 0;
  let inTransitCents = 0;
  let inTransitCount = 0;
  let unverifiedPendingCents = 0;
  let unverifiedPendingCount = 0;
  let stalePendingCents = 0;
  let stalePendingCount = 0;

  for (const raw of data ?? []) {
    const row = raw as {
      amount_cents?: number | null;
      processing_fee_cents?: number | null;
      net_settlement_cents?: number | null;
      settlement_status?: string | null;
      paid_at?: string | null;
      gateway_transaction_id?: string | null;
    };
    const amount = Math.max(0, Math.round(Number(row.amount_cents) || 0));
    const fee = Math.max(0, Math.round(Number(row.processing_fee_cents) || 0));
    const netCents = Math.max(0, Math.round(Number(row.net_settlement_cents) || 0));
    const status = String(row.settlement_status ?? "pending").trim().toLowerCase() || "pending";
    const hasGatewayTransactionId = Boolean(String(row.gateway_transaction_id ?? "").trim());

    gross += amount;
    fees += fee;
    net += netCents;
    const bucket = byStatus[status] ?? (byStatus[status] = zeroStatus());
    bucket.count += 1;
    bucket.net_cents += netCents;

    if (status === "pending") {
      if (hasGatewayTransactionId) {
        inTransitCents += netCents;
        inTransitCount += 1;
      } else {
        unverifiedPendingCents += netCents;
        unverifiedPendingCount += 1;
      }
    }

    const paidMs = Date.parse(String(row.paid_at ?? ""));
    if (status === "pending" && Number.isFinite(paidMs) && paidMs < staleCutoff) {
      stalePendingCents += netCents;
      stalePendingCount += 1;
    }
  }

  return {
    from: params.from,
    to: params.to,
    gross_collected_cents: gross,
    processing_fees_cents: fees,
    net_expected_cents: net,
    settled_to_bank_cents: byStatus.settled?.net_cents ?? 0,
    in_transit_cents: inTransitCents,
    in_transit_count: inTransitCount,
    unverified_pending_cents: unverifiedPendingCents,
    unverified_pending_count: unverifiedPendingCount,
    failed_settlement_cents: byStatus.failed?.net_cents ?? 0,
    reversed_cents: byStatus.reversed?.net_cents ?? 0,
    stale_pending_cents: stalePendingCents,
    stale_pending_count: stalePendingCount,
    transaction_count: (data ?? []).length,
    by_status: byStatus,
  };
}
