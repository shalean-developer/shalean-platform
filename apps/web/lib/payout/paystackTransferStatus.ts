import type { SupabaseClient } from "@supabase/supabase-js";

export type PaystackTransferData = {
  transfer_code?: string | null;
  reason?: string | null;
};

export type PaystackStatusPayload = {
  event?: string;
  data?: PaystackTransferData;
  [key: string]: unknown;
};

type PayoutTransferRow = {
  id: string;
  payout_id: string;
  status: string;
};

type EarningsTransferRow = {
  id: string;
  disbursement_id: string;
  status: string;
};

async function getPayoutTransferByCode(
  supabase: SupabaseClient,
  transferCode: string,
): Promise<{ transfer: PayoutTransferRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("payout_transfers")
    .select("id, payout_id, status")
    .eq("transfer_code", transferCode)
    .maybeSingle();

  return { transfer: (data as PayoutTransferRow | null) ?? null, error: error?.message ?? null };
}

async function getEarningsDisbursementTransferByCode(
  supabase: SupabaseClient,
  transferCode: string,
): Promise<{ transfer: EarningsTransferRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("earnings_disbursement_transfers")
    .select("id, disbursement_id, status")
    .eq("transfer_code", transferCode)
    .maybeSingle();

  return { transfer: (data as EarningsTransferRow | null) ?? null, error: error?.message ?? null };
}

async function maybeMarkPayoutPaid(supabase: SupabaseClient, payoutId: string) {
  const { data, error } = await supabase.from("payout_transfers").select("status").eq("payout_id", payoutId);
  if (error) throw new Error(error.message);

  const transfers = (data ?? []) as { status: string }[];
  if (transfers.length === 0) return;
  const anySuccess = transfers.some((t) => t.status === "success");
  const anyProcessing = transfers.some((t) => t.status === "processing");
  if (!anySuccess || anyProcessing) return;

  const { error: updateError } = await supabase
    .from("cleaner_payouts")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_status: "success",
    })
    .eq("id", payoutId)
    .eq("status", "approved")
    .neq("payment_status", "success");

  if (updateError) throw new Error(updateError.message);
}

/** When every child payout in the same disbursement run is `paid`, close the run. */
export async function tryCloseDisbursementRunIfComplete(supabase: SupabaseClient, runId: string) {
  const { data: siblings, error: sibErr } = await supabase.from("cleaner_payouts").select("id, status").eq("payout_run_id", runId);
  if (sibErr) throw new Error(sibErr.message);
  const rows = (siblings ?? []) as { id: string; status: string }[];
  if (!rows.length) return;
  if (rows.some((r) => r.status !== "paid")) return;

  const { error: runErr } = await supabase
    .from("cleaner_payout_runs")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "processing");

  if (runErr) throw new Error(runErr.message);
}

async function maybeMarkPayoutRunPaid(supabase: SupabaseClient, payoutId: string) {
  const { data: self, error: selfErr } = await supabase.from("cleaner_payouts").select("payout_run_id").eq("id", payoutId).maybeSingle();
  if (selfErr) throw new Error(selfErr.message);
  const runId = (self as { payout_run_id?: string | null } | null)?.payout_run_id;
  if (!runId) return;
  await tryCloseDisbursementRunIfComplete(supabase, runId);
}

async function applyPayoutTransferSuccess(
  supabase: SupabaseClient,
  transfer: PayoutTransferRow,
  data: PaystackTransferData,
  payload?: PaystackStatusPayload,
) {
  if (transfer.status === "success") return { ignored: "already successful" };

  const { error: updateError } = await supabase
    .from("payout_transfers")
    .update({
      status: "success",
      error: null,
      webhook_payload: payload ?? null,
      webhook_processed_at: new Date().toISOString(),
    })
    .eq("id", transfer.id)
    .neq("status", "success");

  if (updateError) throw new Error(updateError.message);

  await maybeMarkPayoutPaid(supabase, transfer.payout_id);
  await maybeMarkPayoutRunPaid(supabase, transfer.payout_id);
  return { transferCode: data.transfer_code, payoutId: transfer.payout_id, kind: "cleaner_payout" as const };
}

async function applyEarningsDisbursementTransferSuccess(
  supabase: SupabaseClient,
  transfer: EarningsTransferRow,
  data: PaystackTransferData,
  payload?: PaystackStatusPayload,
) {
  if (transfer.status === "success") return { ignored: "already successful" };

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("earnings_disbursement_transfers")
    .update({
      status: "success",
      error: null,
      webhook_payload: payload ?? null,
      webhook_processed_at: now,
    })
    .eq("id", transfer.id)
    .neq("status", "success");

  if (updateError) throw new Error(updateError.message);

  const { error: disbErr } = await supabase
    .from("cleaner_earnings_disbursements")
    .update({
      status: "paid",
      paid_at: now,
      updated_at: now,
    })
    .eq("id", transfer.disbursement_id)
    .eq("status", "processing");

  if (disbErr) throw new Error(disbErr.message);

  const { error: earnErr } = await supabase
    .from("cleaner_earnings")
    .update({
      status: "paid",
      paid_at: now,
    })
    .eq("disbursement_id", transfer.disbursement_id)
    .eq("status", "processing");

  if (earnErr) throw new Error(earnErr.message);

  return { transferCode: data.transfer_code, disbursementId: transfer.disbursement_id, kind: "cleaner_earnings" as const };
}

async function applyPayoutTransferFailed(
  supabase: SupabaseClient,
  transfer: PayoutTransferRow,
  data: PaystackTransferData,
  payload?: PaystackStatusPayload,
) {
  if (transfer.status === "success") return { ignored: "already successful" };

  const { error: updateError } = await supabase
    .from("payout_transfers")
    .update({
      status: "failed",
      error: data.reason?.trim() || "Transfer failed",
      webhook_payload: payload ?? null,
      webhook_processed_at: new Date().toISOString(),
    })
    .eq("id", transfer.id)
    .neq("status", "success");

  if (updateError) throw new Error(updateError.message);

  const { data: transfers, error: transfersError } = await supabase
    .from("payout_transfers")
    .select("status")
    .eq("payout_id", transfer.payout_id);
  if (transfersError) throw new Error(transfersError.message);

  const statuses = ((transfers ?? []) as { status: string }[]).map((row) => row.status);
  const paymentStatus = statuses.includes("success") && statuses.includes("failed") ? "partial_failed" : "failed";

  const { error: payoutError } = await supabase
    .from("cleaner_payouts")
    .update({ payment_status: paymentStatus })
    .eq("id", transfer.payout_id)
    .neq("payment_status", "success");

  if (payoutError) throw new Error(payoutError.message);

  return { transferCode: data.transfer_code, payoutId: transfer.payout_id, kind: "cleaner_payout" as const };
}

async function applyEarningsDisbursementTransferFailed(
  supabase: SupabaseClient,
  transfer: EarningsTransferRow,
  data: PaystackTransferData,
  payload?: PaystackStatusPayload,
) {
  if (transfer.status === "success") return { ignored: "already successful" };

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("earnings_disbursement_transfers")
    .update({
      status: "failed",
      error: data.reason?.trim() || "Transfer failed",
      webhook_payload: payload ?? null,
      webhook_processed_at: now,
    })
    .eq("id", transfer.id)
    .neq("status", "success");

  if (updateError) throw new Error(updateError.message);

  const { error: earnErr } = await supabase
    .from("cleaner_earnings")
    .update({ status: "approved", disbursement_id: null })
    .eq("disbursement_id", transfer.disbursement_id)
    .eq("status", "processing");

  if (earnErr) throw new Error(earnErr.message);

  const { error: disbErr } = await supabase
    .from("cleaner_earnings_disbursements")
    .update({ status: "failed", updated_at: now })
    .eq("id", transfer.disbursement_id)
    .eq("status", "processing");

  if (disbErr) throw new Error(disbErr.message);

  return { transferCode: data.transfer_code, disbursementId: transfer.disbursement_id, kind: "cleaner_earnings" as const };
}

export async function applyTransferSuccess(
  supabase: SupabaseClient,
  data: PaystackTransferData,
  payload?: PaystackStatusPayload,
) {
  const transferCode = data.transfer_code?.trim();
  if (!transferCode) return { ignored: "missing transfer_code" };

  const { transfer: payoutTransfer, error: payoutErr } = await getPayoutTransferByCode(supabase, transferCode);
  if (payoutErr) throw new Error(payoutErr);
  if (payoutTransfer) {
    return applyPayoutTransferSuccess(supabase, payoutTransfer, data, payload);
  }

  const { transfer: earningsTransfer, error: earnErr } = await getEarningsDisbursementTransferByCode(supabase, transferCode);
  if (earnErr) throw new Error(earnErr);
  if (earningsTransfer) {
    return applyEarningsDisbursementTransferSuccess(supabase, earningsTransfer, data, payload);
  }

  return { ignored: "unknown transfer_code" };
}

export async function applyTransferFailed(
  supabase: SupabaseClient,
  data: PaystackTransferData,
  payload?: PaystackStatusPayload,
) {
  const transferCode = data.transfer_code?.trim();
  if (!transferCode) return { ignored: "missing transfer_code" };

  const { transfer: payoutTransfer, error: payoutErr } = await getPayoutTransferByCode(supabase, transferCode);
  if (payoutErr) throw new Error(payoutErr);
  if (payoutTransfer) {
    return applyPayoutTransferFailed(supabase, payoutTransfer, data, payload);
  }

  const { transfer: earningsTransfer, error: earnErr } = await getEarningsDisbursementTransferByCode(supabase, transferCode);
  if (earnErr) throw new Error(earnErr);
  if (earningsTransfer) {
    return applyEarningsDisbursementTransferFailed(supabase, earningsTransfer, data, payload);
  }

  return { ignored: "unknown transfer_code" };
}
