import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";

export const MARKETING_POLICY_VERSION = "marketing-email-2026-11-v1";
type Outcome = { ok: true; providerSync?: "updated" | "not_found" | "retry_required" } | { ok: false; reason: string };
type AtomicOutcome = "new" | "replay_completed" | "retry_required" | "superseded" | "legacy_confirmation_required";

/**
 * Record grants and signed withdrawals through one service-role-only,
 * customer-row-locked PostgreSQL transaction. This call never writes to Resend.
 * A separate, explicitly authorized worker reconciles provider state.
 *
 * Signed withdrawals require a generation checked under the customer-row lock.
 * Legacy links cannot mutate preferences; customers use authenticated preferences.
 */
export async function recordCustomerMarketingDecision(
  admin: SupabaseClient,
  input: {
    customerId: string;
    authenticatedEmail: string;
    decision: "granted" | "withdrawn";
    explicitOptIn: boolean;
    evidenceReference: string;
    source: "authenticated_preferences" | "signed_one_click";
    apiKey?: string;
    tokenGeneration?: number;
  },
): Promise<Outcome> {
  if (input.decision === "granted" && !input.explicitOptIn)
    return { ok: false, reason: "explicit_opt_in_required" };
  if (!input.customerId || !input.evidenceReference)
    return { ok: false, reason: "invalid_request" };
  const normalized = validateEmailRecipient(input.authenticatedEmail);
  if (!normalized.allowed) return { ok: false, reason: "invalid_recipient" };
  if (input.source === "signed_one_click" && input.decision !== "withdrawn")
    return { ok: false, reason: "invalid_request" };

  const { data, error } = await admin.rpc("marketing_record_consent_decision_atomic", {
    p_customer_id: input.customerId,
    p_email: normalized.normalized,
    p_decision: input.decision,
    p_source: input.source,
    p_policy_version: MARKETING_POLICY_VERSION,
    p_evidence_reference: input.evidenceReference,
    p_explicit_opt_in: input.explicitOptIn,
    p_token_generation: input.tokenGeneration ?? null,
  });
  if (error) return { ok: false, reason: "consent_transaction_failed" };
  // A TABLE-returning RPC is an array; reject unexpected shapes fail-closed.
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  const outcome = row && typeof row.outcome === "string" ? row.outcome as AtomicOutcome : null;
  if (!outcome || !["new", "replay_completed", "retry_required", "superseded", "legacy_confirmation_required"].includes(outcome))
    return { ok: false, reason: "consent_transaction_invalid_result" };
  if (outcome === "superseded" && input.source !== "signed_one_click")
    return { ok: false, reason: "consent_transaction_invalid_result" };
  if (outcome === "legacy_confirmation_required")
    return { ok: false, reason: "unsubscribe_legacy_confirmation_required" };
  if (outcome === "superseded")
    return { ok: false, reason: "unsubscribe_token_superseded" };
  // No interactive provider call. Always reconcile through the private queue.
  return { ok: true, providerSync: "retry_required" };
}
