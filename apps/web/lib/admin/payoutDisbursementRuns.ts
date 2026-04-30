import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminPayoutRunListRow = {
  id: string;
  status: string;
  total_amount_cents: number;
  created_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
  paystack_batch_ref?: string | null;
  cleaner_count: number;
};

export type AdminPayoutRunDetailPayout = {
  id: string;
  cleaner_id: string;
  cleaner_name: string;
  total_amount_cents: number;
  status: string;
  payment_status: string | null;
  payment_reference: string | null;
  period_start: string;
  period_end: string;
  frozen_at?: string | null;
  created_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
  bank_code: string | null;
  account_masked: string | null;
};

export async function listPayoutDisbursementRuns(admin: SupabaseClient, limit = 100): Promise<AdminPayoutRunListRow[]> {
  const { data: runs, error } = await admin
    .from("cleaner_payout_runs")
    .select("id, status, total_amount_cents, created_at, approved_at, paid_at, paystack_batch_ref")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const runList = runs ?? [];
  const runIds = runList.map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
  const cleanerCounts = new Map<string, number>();

  if (runIds.length) {
    const { data: payouts } = await admin.from("cleaner_payouts").select("payout_run_id").in("payout_run_id", runIds);
    for (const p of payouts ?? []) {
      const rid = String((p as { payout_run_id?: string | null }).payout_run_id ?? "");
      if (rid) cleanerCounts.set(rid, (cleanerCounts.get(rid) ?? 0) + 1);
    }
  }

  return runList.map((r) => {
    const row = r as {
      id: string;
      status: string;
      total_amount_cents: number;
      created_at: string;
      approved_at?: string | null;
      paid_at?: string | null;
      paystack_batch_ref?: string | null;
    };
    return {
      ...row,
      cleaner_count: cleanerCounts.get(row.id) ?? 0,
    };
  });
}

function maskAccount(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `****${digits.slice(-4)}`;
}

export async function getPayoutDisbursementRunDetail(
  admin: SupabaseClient,
  runId: string,
): Promise<{ run: Record<string, unknown>; payouts: AdminPayoutRunDetailPayout[] }> {
  const { data: run, error: runErr } = await admin
    .from("cleaner_payout_runs")
    .select("id, status, total_amount_cents, created_at, approved_at, paid_at, paystack_batch_ref")
    .eq("id", runId)
    .maybeSingle();

  if (runErr) throw new Error(runErr.message);
  if (!run) throw new Error("Run not found.");

  const { data: payouts, error: pErr } = await admin
    .from("cleaner_payouts")
    .select(
      "id, cleaner_id, total_amount_cents, status, payment_status, payment_reference, period_start, period_end, frozen_at, created_at, approved_at, paid_at",
    )
    .eq("payout_run_id", runId)
    .order("total_amount_cents", { ascending: false });

  if (pErr) throw new Error(pErr.message);

  const payoutRows = payouts ?? [];
  const cleanerIds = [...new Set(payoutRows.map((p) => String((p as { cleaner_id?: string }).cleaner_id ?? "")).filter(Boolean))];
  const names = new Map<string, string>();
  const banks = new Map<string, { bank_code: string | null; account_number: string | null }>();

  if (cleanerIds.length) {
    const [{ data: cleaners }, { data: details }] = await Promise.all([
      admin.from("cleaners").select("id, full_name").in("id", cleanerIds),
      admin.from("cleaner_payment_details").select("cleaner_id, bank_code, account_number").in("cleaner_id", cleanerIds),
    ]);
    for (const c of cleaners ?? []) {
      const row = c as { id?: string; full_name?: string | null };
      if (row.id) names.set(row.id, row.full_name?.trim() || row.id);
    }
    for (const d of details ?? []) {
      const row = d as { cleaner_id?: string; bank_code?: string | null; account_number?: string | null };
      if (row.cleaner_id) banks.set(row.cleaner_id, { bank_code: row.bank_code ?? null, account_number: row.account_number ?? null });
    }
  }

  const out: AdminPayoutRunDetailPayout[] = payoutRows.map((p) => {
    const row = p as {
      id: string;
      cleaner_id: string;
      total_amount_cents: number;
      status: string;
      payment_status?: string | null;
      payment_reference?: string | null;
      period_start: string;
      period_end: string;
      frozen_at?: string | null;
      created_at: string;
      approved_at?: string | null;
      paid_at?: string | null;
    };
    const bk = banks.get(row.cleaner_id);
    return {
      id: row.id,
      cleaner_id: row.cleaner_id,
      cleaner_name: names.get(row.cleaner_id) ?? row.cleaner_id,
      total_amount_cents: row.total_amount_cents,
      status: row.status,
      payment_status: row.payment_status ?? null,
      payment_reference: row.payment_reference ?? null,
      period_start: row.period_start,
      period_end: row.period_end,
      frozen_at: row.frozen_at ?? null,
      created_at: row.created_at,
      approved_at: row.approved_at ?? null,
      paid_at: row.paid_at ?? null,
      bank_code: bk?.bank_code ?? null,
      account_masked: maskAccount(bk?.account_number ?? null),
    };
  });

  return { run: run as Record<string, unknown>, payouts: out };
}
