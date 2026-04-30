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

type TransferRow = {
  id: string;
  payout_id: string;
  status: string;
};

async function getTransferByCode(
  supabase: SupabaseClient,
  transferCode: string,
): Promise<{ transfer: TransferRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("payout_transfers")
    .select("id, payout_id, status")
    .eq("transfer_code", transferCode)
    .maybeSingle();

  return { transfer: (data as TransferRow | null) ?? null, error: error?.message ?? null };
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

export async function applyTransferSuccess(
  supabase: SupabaseClient,
  data: PaystackTransferData,
  payload?: PaystackStatusPayload,
) {
  const transferCode = data.transfer_code?.trim();
  if (!transferCode) return { ignored: "missing transfer_code" };

  const { transfer, error } = await getTransferByCode(supabase, transferCode);
  if (error) throw new Error(error);
  if (!transfer) return { ignored: "unknown transfer_code" };
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
  return { transferCode, payoutId: transfer.payout_id };
}

export async function applyTransferFailed(
  supabase: SupabaseClient,
  data: PaystackTransferData,
  payload?: PaystackStatusPayload,
) {
  const transferCode = data.transfer_code?.trim();
  if (!transferCode) return { ignored: "missing transfer_code" };

  const { transfer, error } = await getTransferByCode(supabase, transferCode);
  if (error) throw new Error(error);
  if (!transfer) return { ignored: "unknown transfer_code" };
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

  return { transferCode, payoutId: transfer.payout_id };
}
