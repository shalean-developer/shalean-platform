import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

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
    .select("id, status, calculated_amount_cents, total_amount_cents, adjustment_note")
    .eq("id", params.payoutId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: "Payout not found." };

  const status = String((existing as { status?: string }).status ?? "").toLowerCase();
  if (!EDITABLE_STATUSES.has(status)) {
    return { ok: false, error: "Only pending or frozen payouts can be edited." };
  }

  const calculatedRaw = (existing as { calculated_amount_cents?: number | null }).calculated_amount_cents;
  const calculated =
    calculatedRaw != null && Number.isFinite(Number(calculatedRaw)) ? Math.round(Number(calculatedRaw)) : null;
  const previousTotal = Math.round(Number((existing as { total_amount_cents?: number }).total_amount_cents ?? 0));
  const wasAdjusted = calculated != null && amount !== calculated;
  const note = params.adjustmentNote?.trim() || null;

  if (wasAdjusted && (!note || note.length < 3)) {
    return {
      ok: false,
      error: "Adjustment reason is required when the amount differs from the calculated total (min 3 characters).",
    };
  }

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

  void logPayoutAuditEvent(admin, {
    eventType: "payout_amount_adjusted",
    actorUserId: params.adjustedBy,
    payoutId: params.payoutId,
    amountCents: amount,
    oldValues: {
      total_amount_cents: previousTotal,
      calculated_amount_cents: calculated,
      adjustment_note: (existing as { adjustment_note?: string | null }).adjustment_note ?? null,
    },
    newValues: {
      total_amount_cents: amount,
      calculated_amount_cents: calculated,
      adjustment_note: note,
      override: wasAdjusted,
    },
  });

  return { ok: true };
}
