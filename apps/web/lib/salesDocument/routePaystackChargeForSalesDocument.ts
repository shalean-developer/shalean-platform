import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applySalesDocumentPayment,
  type ApplySalesDocumentPaymentResult,
} from "@/lib/salesDocument/applySalesDocumentPayment";

export type PaystackChargeSalesDocRouting =
  | { kind: "not_sales_doc" }
  | { kind: "sales_doc_settled"; documentId: string }
  | { kind: "sales_doc_already_processed"; reason: "already_paid" | "duplicate_charge" }
  | { kind: "sales_doc_error"; error: string };

export async function routePaystackChargeForSalesDocument(
  admin: SupabaseClient,
  params: { reference: string; amountCents: number; documentIdHint?: string | null },
): Promise<PaystackChargeSalesDocRouting> {
  const outcome = await applySalesDocumentPayment(admin, params);
  return interpretSalesDocumentOutcome(outcome);
}

export function interpretSalesDocumentOutcome(
  outcome: ApplySalesDocumentPaymentResult,
): PaystackChargeSalesDocRouting {
  if (outcome.ok && "skipped" in outcome && outcome.skipped) {
    if (outcome.reason === "not_found") return { kind: "not_sales_doc" };
    if (outcome.reason === "already_paid" || outcome.reason === "duplicate_charge") {
      return { kind: "sales_doc_already_processed", reason: outcome.reason };
    }
  }
  if (outcome.ok && "settled" in outcome) {
    return { kind: "sales_doc_settled", documentId: outcome.documentId };
  }
  if (!outcome.ok) {
    return { kind: "sales_doc_error", error: outcome.error };
  }
  return { kind: "not_sales_doc" };
}

export function shouldShortCircuitForSalesDocument(
  routing: PaystackChargeSalesDocRouting,
): routing is
  | { kind: "sales_doc_settled"; documentId: string }
  | { kind: "sales_doc_already_processed"; reason: "already_paid" | "duplicate_charge" } {
  return routing.kind === "sales_doc_settled" || routing.kind === "sales_doc_already_processed";
}
