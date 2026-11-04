import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";
import { reconcileResendUnsubscribe } from "@/lib/email/reconcileResendUnsubscribe";
import { syncConsentedMarketingContact } from "@/lib/email/syncConsentedMarketingContact";

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
  if (eventError && !(input.decision === "withdrawn" && input.source === "signed_one_click" && eventError.code === "23505"))
    return { ok: false, reason: "consent_write_failed" };

  if (input.decision === "granted") {
    // Never clear prior CRM or Resend unsubscribes. Enrollment is guarded by
    // the fresh consent ledger, suppression lists and provider contact status.
    if (input.apiKey) {
      const enrollment = await syncConsentedMarketingContact(admin, {
        customerId: input.customerId, email, apiKey: input.apiKey,
        segmentId: process.env.RESEND_AUDIENCE_SEGMENT_ID,
      });
      if (enrollment === "retry_required" || enrollment === "blocked") {
        // Retain consent evidence, but do not claim the contact is subscribed.
        return { ok: true };
      }
    }
    return { ok: true };
  }
  const { error: profileUpdateError } = await admin.from("user_profiles")
    .update({ marketing_emails_unsubscribed_at: new Date().toISOString() })
    .eq("id", input.customerId);
  if (profileUpdateError) {
    // The latest withdrawn event still blocks future marketing in the sending gate.
    return { ok: false, reason: "unsubscribe_profile_sync_failed" };
  }
  // Durably queue provider reconciliation before attempting any provider write.
  const { error: queueError } = await admin.from("marketing_email_reconciliation_jobs").upsert({
    customer_id: input.customerId, email, action: "unsubscribe",
    status: "pending", next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), last_error: null,
  }, { onConflict: "customer_id,email,action" });
  if (queueError) {
    // The CRM withdrawal is already durable. Tell the caller reconciliation needs attention.
    return { ok: true, providerSync: "retry_required" };
  }
  if (!input.apiKey) return { ok: true, providerSync: "retry_required" };
  const providerSync = await reconcileResendUnsubscribe(email, { apiKey: input.apiKey });
  if (providerSync === "updated" || providerSync === "not_found") {
    await admin.from("marketing_email_reconciliation_jobs").update({
      status: "completed", last_error: null, updated_at: new Date().toISOString(),
    }).eq("customer_id", input.customerId).eq("email", email).eq("action", "unsubscribe");
  }
  return { ok: true, providerSync };
}
