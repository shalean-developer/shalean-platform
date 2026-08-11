import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

type PaystackSettlementStatus = "success" | "processing" | "pending" | "failed";

type PaystackSettlement = {
  id: number | string;
  status: PaystackSettlementStatus;
  settlement_date?: string | null;
  total_amount?: number | null;
  effective_amount?: number | null;
  total_fees?: number | null;
  total_processed?: number | null;
};

type PaystackSettlementTransaction = {
  id?: number | string | null;
  reference?: string | null;
};

type PaystackListResponse<T> = {
  status?: boolean;
  message?: string;
  data?: T[];
  meta?: { page?: number; pageCount?: number; total?: number; perPage?: number };
};

export type PaystackSettlementReconciliationResult = {
  from: string;
  to: string;
  settlementsScanned: number;
  settlementTransactionsScanned: number;
  matchedTransactions: number;
  updatedSettled: number;
  updatedFailed: number;
  alreadyCorrect: number;
  unmatchedReferences: string[];
};

function ymd(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  return d.toISOString().slice(0, 10);
}

function defaultRange(now = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 62 * 86_400_000);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

async function paystackGet<T>(path: string, secret: string): Promise<T> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as { status?: boolean; message?: string };
  if (!response.ok || payload.status === false) {
    throw new Error(`Paystack ${path} failed (${response.status}): ${payload.message ?? "unknown error"}`);
  }
  return payload as T;
}

async function listSettlements(secret: string, from: string, to: string): Promise<PaystackSettlement[]> {
  const rows: PaystackSettlement[] = [];
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({ perPage: "100", page: String(page), from, to });
    const payload = await paystackGet<PaystackListResponse<PaystackSettlement>>(`/settlement?${params}`, secret);
    const batch = payload.data ?? [];
    rows.push(...batch);
    const pageCount = Number(payload.meta?.pageCount ?? 0);
    if (!batch.length || (pageCount > 0 && page >= pageCount) || batch.length < 100) break;
  }
  return rows;
}

async function listSettlementTransactions(secret: string, settlementId: string): Promise<PaystackSettlementTransaction[]> {
  const rows: PaystackSettlementTransaction[] = [];
  for (let page = 1; page <= 50; page++) {
    const params = new URLSearchParams({ perPage: "100", page: String(page) });
    const payload = await paystackGet<PaystackListResponse<PaystackSettlementTransaction>>(
      `/settlement/${encodeURIComponent(settlementId)}/transactions?${params}`,
      secret,
    );
    const batch = payload.data ?? [];
    rows.push(...batch);
    const pageCount = Number(payload.meta?.pageCount ?? 0);
    if (!batch.length || (pageCount > 0 && page >= pageCount) || batch.length < 100) break;
  }
  return rows;
}

/**
 * Reconciles Paystack bank-settlement truth into `payment_transactions`.
 *
 * Only Paystack settlement membership is authoritative for `settled`. A successful
 * charge is cash collected from the customer, but it is not bank cash until Paystack
 * includes it in a successful settlement. Failed settlement membership remains
 * non-bank cash and is marked `failed` so dashboards do not count it as available.
 */
export async function reconcilePaystackSettlements(
  admin: SupabaseClient,
  opts?: { from?: string; to?: string; now?: Date },
): Promise<PaystackSettlementReconciliationResult> {
  const secret = String(process.env.PAYSTACK_SECRET_KEY ?? "").trim();
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured.");

  const range = defaultRange(opts?.now ?? new Date());
  const from = opts?.from?.trim() || range.from;
  const to = opts?.to?.trim() || range.to;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error("Invalid Paystack settlement reconciliation date range.");
  }

  const settlements = await listSettlements(secret, from, to);
  let settlementTransactionsScanned = 0;
  let matchedTransactions = 0;
  let updatedSettled = 0;
  let updatedFailed = 0;
  let alreadyCorrect = 0;
  const unmatchedReferences: string[] = [];

  for (const settlement of settlements) {
    const settlementId = String(settlement.id ?? "").trim();
    if (!settlementId) continue;
    const status = String(settlement.status ?? "").toLowerCase() as PaystackSettlementStatus;
    if (!(["success", "failed"] as string[]).includes(status)) continue;

    const txs = await listSettlementTransactions(secret, settlementId);
    settlementTransactionsScanned += txs.length;
    const settlementDate = ymd(settlement.settlement_date) ?? to;

    for (const tx of txs) {
      const reference = String(tx.reference ?? "").trim();
      if (!reference) continue;
      const { data: existing, error: readErr } = await admin
        .from("payment_transactions")
        .select("id, settlement_status, settlement_date")
        .eq("gateway", "paystack")
        .eq("gateway_reference", reference)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!existing?.id) {
        if (unmatchedReferences.length < 100) unmatchedReferences.push(reference);
        continue;
      }
      matchedTransactions += 1;

      const desiredStatus = status === "success" ? "settled" : "failed";
      if (
        String(existing.settlement_status ?? "") === desiredStatus &&
        String(existing.settlement_date ?? "") === settlementDate
      ) {
        alreadyCorrect += 1;
        continue;
      }

      const { error: updateErr } = await admin
        .from("payment_transactions")
        .update({
          settlement_status: desiredStatus,
          settlement_date: settlementDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updateErr) throw new Error(updateErr.message);
      if (desiredStatus === "settled") updatedSettled += 1;
      else updatedFailed += 1;
    }
  }

  const result: PaystackSettlementReconciliationResult = {
    from,
    to,
    settlementsScanned: settlements.length,
    settlementTransactionsScanned,
    matchedTransactions,
    updatedSettled,
    updatedFailed,
    alreadyCorrect,
    unmatchedReferences,
  };

  void logSystemEvent({
    level: unmatchedReferences.length ? "warn" : "info",
    source: "paystack_settlement_reconciliation",
    message: "Paystack settlement reconciliation completed",
    context: result,
  });

  return result;
}
