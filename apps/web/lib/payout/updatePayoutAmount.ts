import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

const EDITABLE_STATUSES = new Set(["pending", "frozen"]);

export async function updateCleanerPayoutAmount(
  admin: SupabaseClient,
  params: {
    payoutId: string;
    totalAmountCents: number;
    adjustmentNote?: string | null;
    adjustedBy: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const amount = Math.max(0, Math.round(params.totalAmountCents));
  if (!Number.isFinite(amount)) {
    return { ok: false, error: "Invalid payout amount." };
  }

  const { data: existing, error: loadErr } = await admin
    .from("cleaner_payouts")
    .select("id, status, calculated_amount_cents, total_amount_cents")
    .eq("id", params.payoutId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: "Payout not found." };

  const status = String((existing as { status?: string }).status ?? "").toLowerCase();
  if (!EDITABLE_STATUSES.has(status)) {
    return { ok: false, error: "Only pending or frozen payouts can be edited." };
  }

  const note = params.adjustmentNote?.trim() || null;
  const calculated = (existing as { calculated_amount_cents?: number | null }).calculated_amount_cents;
  const wasAdjusted = calculated != null && amount !== calculated;

  const patch: Record<string, unknown> = {
    total_amount_cents: amount,
    adjustment_note: wasAdjusted ? note : null,
    amount_adjusted_at: wasAdjusted ? new Date().toISOString() : null,
    amount_adjusted_by: wasAdjusted ? params.adjustedBy : null,
  };

  const { data: updated, error: upErr } = await admin
    .from("cleaner_payouts")
    .update(patch)
    .eq("id", params.payoutId)
    .in("status", ["pending", "frozen"])
    .select("id");
  if (upErr) return { ok: false, error: upErr.message };
  if (!updated?.length) return { ok: false, error: "Payout could not be updated." };

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_AMOUNT_ADJUSTED",
    message: "Cleaner payout amount adjusted before approval",
    context: {
      payoutId: params.payoutId,
      adjustedBy: params.adjustedBy,
      calculated_amount_cents: calculated,
      total_amount_cents: amount,
      adjustment_note: note,
    },
  });

  return { ok: true };
}
