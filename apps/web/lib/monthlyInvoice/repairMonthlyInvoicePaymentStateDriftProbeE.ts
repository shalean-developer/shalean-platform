import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshRecurringBookingPaymentState } from "@/lib/booking/bookingOperations";
import { logSystemEvent } from "@/lib/logging/systemLog";

/** Matches `Probe E` in `supabase/queries/audit_monthly_invoice_settlement_invariants.sql` for `payment_state` only. */
export function monthlyInvoiceProbeEPaymentStateDrift(payment_state: string | null | undefined): boolean {
  return (payment_state ?? "").trim().toLowerCase() !== "charged";
}

export const DEFAULT_REPAIR_MONTHLY_PAYMENT_STATE_LIMIT = 200;
export const DEFAULT_REPAIR_MONTHLY_PAYMENT_STATE_SCAN = 2000;
export const MAX_REPAIR_MONTHLY_PAYMENT_STATE_LIMIT = 500;
export const MAX_REPAIR_MONTHLY_PAYMENT_STATE_SCAN = 10_000;

export type RepairMonthlyInvoicePaymentStateDriftProbeEResult =
  | {
      ok: true;
      candidates_scanned: number;
      drift_matched: number;
      repaired: number;
      failed: number;
    }
  | { ok: false; error: string };

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

/**
 * Phase 10D: refresh `payment_state` only for historical rows matching Probe E (paid invoice + recurring + success,
 * non–pending_payment, projection not `charged`). No billing, invoice, or payout column updates.
 */
export async function repairMonthlyInvoicePaymentStateDriftProbeE(
  admin: SupabaseClient,
  options?: { repairLimit?: number; scanLimit?: number },
): Promise<RepairMonthlyInvoicePaymentStateDriftProbeEResult> {
  const repairLimit = clamp(
    options?.repairLimit ?? DEFAULT_REPAIR_MONTHLY_PAYMENT_STATE_LIMIT,
    1,
    MAX_REPAIR_MONTHLY_PAYMENT_STATE_LIMIT,
  );
  const scanLimit = clamp(
    options?.scanLimit ?? DEFAULT_REPAIR_MONTHLY_PAYMENT_STATE_SCAN,
    repairLimit,
    MAX_REPAIR_MONTHLY_PAYMENT_STATE_SCAN,
  );

  const { data: candidates, error: cErr } = await admin
    .from("bookings")
    .select("id, monthly_invoice_id, payment_state")
    .eq("is_recurring_generated", true)
    .eq("payment_status", "success")
    .neq("status", "cancelled")
    .neq("status", "pending_payment")
    .not("monthly_invoice_id", "is", null)
    .or("payment_state.is.null,payment_state.neq.charged")
    .order("updated_at", { ascending: false })
    .limit(scanLimit);

  if (cErr) return { ok: false, error: cErr.message };

  const rows = (candidates ?? []) as { id: string; monthly_invoice_id: string | null; payment_state: string | null }[];
  const candidates_scanned = rows.length;

  if (candidates_scanned === 0) {
    await logSystemEvent({
      level: "info",
      source: "monthly_invoice/repair_payment_state_drift",
      message: "monthly_payment_state_drift_probe_e_none",
      context: { candidates_scanned, repair_limit: repairLimit, scan_limit: scanLimit },
    });
    return { ok: true, candidates_scanned, drift_matched: 0, repaired: 0, failed: 0 };
  }

  const invIds = [...new Set(rows.map((r) => String(r.monthly_invoice_id ?? "")).filter((id) => id.length > 0))];
  const { data: invs, error: invErr } = await admin.from("monthly_invoices").select("id, status").in("id", invIds);
  if (invErr) return { ok: false, error: invErr.message };

  const paid = new Set(
    (invs ?? [])
      .filter((i) => String((i as { status?: string | null }).status ?? "").trim().toLowerCase() === "paid")
      .map((i) => String((i as { id: string }).id)),
  );

  const toRepair = rows
    .filter(
      (r) =>
        paid.has(String(r.monthly_invoice_id)) &&
        typeof r.monthly_invoice_id === "string" &&
        r.monthly_invoice_id.length > 0 &&
        monthlyInvoiceProbeEPaymentStateDrift(r.payment_state),
    )
    .slice(0, repairLimit)
    .map((r) => r.id);

  const drift_matched = toRepair.length;
  let repaired = 0;
  let failed = 0;

  for (const bookingId of toRepair) {
    try {
      await refreshRecurringBookingPaymentState({ admin, bookingId });
      repaired++;
    } catch (cause) {
      failed++;
      const message = cause instanceof Error ? cause.message : String(cause);
      await logSystemEvent({
        level: "error",
        source: "monthly_invoice/repair_payment_state_drift",
        message: "monthly_payment_state_drift_refresh_failed",
        context: { booking_id: bookingId, error: message },
      });
    }
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/repair_payment_state_drift",
    message: "monthly_payment_state_drift_probe_e_repair_done",
    context: {
      candidates_scanned,
      drift_matched,
      repaired,
      failed,
      repair_limit: repairLimit,
      scan_limit: scanLimit,
    },
  });

  return { ok: true, candidates_scanned, drift_matched, repaired, failed };
}
