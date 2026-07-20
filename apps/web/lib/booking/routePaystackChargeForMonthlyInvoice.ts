import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyMonthlyInvoicePayment,
  type ApplyMonthlyInvoicePaymentResult,
} from "@/lib/monthlyInvoice/applyMonthlyInvoicePayment";

/**
 * **M-5 routing helper — single source of truth for "is this Paystack charge a monthly invoice?"**
 *
 * Used by:
 *   - `/api/paystack/webhook`   (server-authoritative `charge.success` handler)
 *   - `/api/paystack/verify`     (browser fallback finalizer; GET + POST)
 *   - `/api/payments/verify`    (booking-page success poll)
 *
 * Why centralize: prior to M-5 only the webhook called `applyMonthlyInvoicePayment` first; the
 * verify routes routed every reference straight into `runPaystackVerifyFinalizePipeline` →
 * `upsertBookingFromPaystack`. A late browser-side verify call for a monthly-invoice reference
 * therefore ran the booking-settlement pipeline (wrong allocation path, wrong payout-eligibility
 * triggers) instead of `applyMonthlyInvoicePayment` (the H-1 child-allocation path).
 *
 * **This helper does NOT change H-1 allocation or any payout formula** — it only decides which
 * authoritative side-effect function (`applyMonthlyInvoicePayment` vs `upsertBookingFromPaystack`)
 * processes the inbound charge. `applyMonthlyInvoicePayment` is the side-effecting call;
 * `monthly_invoice_paystack_charge_dedup` makes a duplicate call from a second route a no-op
 * (`reason: "duplicate_charge"`), so calling this helper from both webhook AND verify is safe.
 *
 * Discriminated outcomes (callers MUST handle every kind):
 *   - `not_monthly`               — reference is not in `monthly_invoices.paystack_reference`.
 *                                   Caller MUST run the booking-settlement flow
 *                                   (`upsertBookingFromPaystack` / `runPaystackVerifyFinalizePipeline`).
 *   - `monthly_settled`           — `applyMonthlyInvoicePayment` ran successfully (full | partial).
 *                                   Caller MUST short-circuit; do NOT run the booking flow.
 *   - `monthly_already_processed` — idempotent skip (`already_paid` | `duplicate_charge`).
 *                                   Caller MUST short-circuit; do NOT run the booking flow.
 *   - `monthly_error`             — reference targeted a monthly invoice but
 *                                   `applyMonthlyInvoicePayment` errored. The webhook preserves
 *                                   its pre-M-5 behaviour and falls through to the booking flow
 *                                   (the booking flow will not match either, returns its own
 *                                   error); verify routes do the same for symmetry.
 *
 * Convergence guarantee: the webhook and every verify route consume this discriminator and act
 * on each kind identically, so an attacker / replay cannot make webhook and verify disagree on
 * whether a reference should hit the booking pipeline.
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
  const outcome = await applyMonthlyInvoicePayment(admin, {
    reference: params.reference,
    amountCents: params.amountCents,
    invoiceIdHint: params.invoiceIdHint,
  });
  return interpretMonthlyInvoiceOutcome(outcome);
}

/**
 * Pure mapper: `ApplyMonthlyInvoicePaymentResult` → `PaystackChargeMonthlyRouting`.
 * Exposed so unit tests can assert routing semantics without a Supabase mock.
 */
export function interpretMonthlyInvoiceOutcome(
  outcome: ApplyMonthlyInvoicePaymentResult,
): PaystackChargeMonthlyRouting {
  if (outcome.ok && "skipped" in outcome && outcome.skipped) {
    if (outcome.reason === "not_found") {
      return { kind: "not_monthly" };
    }
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
  if (!outcome.ok) {
    return { kind: "monthly_error", error: outcome.error };
  }
  // Defensive: any unexpected shape falls through to booking flow (matches pre-M-5 webhook).
  return { kind: "not_monthly" };
}

/**
 * The narrowed routing kinds that callers MUST short-circuit on (settled or already-processed).
 * Useful as a type predicate so TypeScript knows that after the predicate is `true`, the routing
 * union no longer contains `not_monthly` or `monthly_error`.
 */
export type PaystackChargeMonthlyShortCircuit =
  | Extract<PaystackChargeMonthlyRouting, { kind: "monthly_settled" }>
  | Extract<PaystackChargeMonthlyRouting, { kind: "monthly_already_processed" }>;

/**
 * Convenience predicate: did the helper short-circuit on a monthly invoice (settled or
 * already-processed)? Returns a TypeScript type guard so callers can read `routing.reason` /
 * `routing.invoiceId` without redundant `kind` checks.
 */
export function shouldShortCircuitForMonthlyInvoice(
  routing: PaystackChargeMonthlyRouting,
): routing is PaystackChargeMonthlyShortCircuit {
  return routing.kind === "monthly_settled" || routing.kind === "monthly_already_processed";
}
