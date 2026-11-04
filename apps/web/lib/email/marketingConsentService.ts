import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";
import { reconcileResendUnsubscribe } from "@/lib/email/reconcileResendUnsubscribe";

export const MARKETING_POLICY_VERSION = "marketing-email-2026-11-v1";
type Outcome = { ok: true; providerSync?: "updated" | "not_found" | "retry_required" } | { ok: false; reason: string };

/**
 * An authenticated API must provide the identity, not the request body.
 * Never infer opt-in from a prior booking, a zero opt-out timestamp, or a Resend contact.
 * A grant is a deliberate, account-authenticated action. Withdrawal is sticky until
 * a later explicit grant, and provider state can still keep marketing blocked.
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
  },
): Promise<Outcome> {
  if (input.decision === "granted" && !input.explicitOptIn)
    return { ok: false, reason: "explicit_opt_in_required" };
  if (!input.customerId || !input.evidenceReference)
    return { ok: false, reason: "invalid_request" };
  const normalized = validateEmailRecipient(input.authenticatedEmail);
  if (!normalized.allowed) return { ok: false, reason: "invalid_recipient" };
  const email = normalized.normalized;
  const { data: profile, error: profileError } = await admin.from("user_profiles")
    .select("id, role, billing_email, marketing_emails_unsubscribed_at")
    .eq("id", input.customerId).maybeSingle();
  if (profileError || profile?.role !== "customer" ||
      profile.billing_email?.trim().toLowerCase() !== email)
    return { ok: false, reason: "customer_identity_unverified" };

  // Write the audit record first. A failed write must never be interpreted as consent.
  const { error: eventError } = await admin.from("marketing_email_consent_events").insert({
    customer_id: input.customerId,
    email,
    purpose: "promotional_email",
    decision: input.decision,
    source: input.source,
    policy_version: MARKETING_POLICY_VERSION,
    evidence_reference: input.evidenceReference,
  });
  if (eventError) return { ok: false, reason: "consent_write_failed" };

  if (input.decision === "granted") {
    // Never clear a prior CRM/Resend unsubscribe just by adding a consent record.
    // Explicit re-subscription is a separate, verified workflow.
    return { ok: true };
  }
  const { error: profileUpdateError } = await admin.from("user_profiles")
    .update({ marketing_emails_unsubscribed_at: new Date().toISOString() })
    .eq("id", input.customerId);
  if (profileUpdateError) {
    // The latest withdrawn event still blocks future marketing in the sending gate.
    return { ok: false, reason: "unsubscribe_profile_sync_failed" };
  }
  // This is outbound provider state change, only for a customer-initiated opt-out.
  // Failures do not undo CRM consent withdrawal. The operator must reconcile later.
  if (!input.apiKey) return { ok: true, providerSync: "retry_required" };
  const providerSync = await reconcileResendUnsubscribe(email, { apiKey: input.apiKey });
  return { ok: true, providerSync };
}
