import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type ApplyMonthlyInvoicePaymentResult,
} from "@/lib/monthlyInvoice/applyMonthlyInvoicePayment";
import { applyMonthlyInvoiceAccountPayment } from "@/lib/monthlyInvoice/applyMonthlyInvoiceAccountPayment";

/**
 * Single routing source for Paystack monthly-invoice charges.
 * Statement-level collection is supported by applyMonthlyInvoiceAccountPayment,
 * which delegates ordinary single-invoice charges to the existing mature payment path.
 */
export type PaystackChargeMonthlyRouting =
  | { kind: "not_monthly" }
  | {
      kind: "monthly_settled";
      invoiceId: string;
      settled: "full" | "partial";
      amount_paid_cents: number | null;
      total_amount_cents: number | null;
    }
  | {
      kind: "monthly_already_processed";
      reason: "already_paid" | "duplicate_charge" | "amount_mismatch_quarantined";
    }
  | { kind: "monthly_error"; error: string };

export async function routePaystackChargeForMonthlyInvoice(
  admin: SupabaseClient,
  params: { reference: string; amountCents: number; invoiceIdHint?: string | null },
): Promise<PaystackChargeMonthlyRouting> {
  const outcome = await applyMonthlyInvoiceAccountPayment(admin, {
    reference: params.reference,
    amountCents: params.amountCents,
    invoiceIdHint: params.invoiceIdHint,
  });
  return interpretMonthlyInvoiceOutcome(outcome);
}

/** Pure mapper used by webhook/verify routing tests. */
export function interpretMonthlyInvoiceOutcome(
  outcome: ApplyMonthlyInvoicePaymentResult,
): PaystackChargeMonthlyRouting {
  if (outcome.ok && "skipped" in outcome && outcome.skipped) {
    if (outcome.reason === "not_found") return { kind: "not_monthly" };
    if (
      outcome.reason === "already_paid" ||
      outcome.reason === "duplicate_charge" ||
      outcome.reason === "amount_mismatch_quarantined"
    ) {
      return { kind: "monthly_already_processed", reason: outcome.reason };
    }
  }
  if (outcome.ok && "settled" in outcome) {
    if (outcome.settled === "full") {
      return {
        kind: "monthly_settled",
        invoiceId: outcome.invoiceId,
        settled: "full",
        amount_paid_cents: null,
        total_amount_cents: null,
      };
    }
    return {
      kind: "monthly_settled",
      invoiceId: outcome.invoiceId,
      settled: "partial",
      amount_paid_cents: outcome.amount_paid_cents,
      total_amount_cents: outcome.total_amount_cents,
    };
  }
  if (!outcome.ok) return { kind: "monthly_error", error: outcome.error };
  return { kind: "not_monthly" };
}

export type PaystackChargeMonthlyShortCircuit =
  | Extract<PaystackChargeMonthlyRouting, { kind: "monthly_settled" }>
  | Extract<PaystackChargeMonthlyRouting, { kind: "monthly_already_processed" }>;

export function shouldShortCircuitForMonthlyInvoice(
  routing: PaystackChargeMonthlyRouting,
): routing is PaystackChargeMonthlyShortCircuit {
  return routing.kind === "monthly_settled" || routing.kind === "monthly_already_processed";
}
