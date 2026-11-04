import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";
import { MARKETING_POLICY_VERSION } from "@/lib/email/marketingConsentService";

export type ProviderPreferenceEvent = {
  type: string;
  email?: string | null;
  unsubscribed?: boolean | null;
  svixId: string;
};

/** Only withdrawals from verified, signed Resend events. Never re-subscribe on contact.updated false. */
export async function applyProviderPreferenceWithdrawal(
  admin: SupabaseClient,
  event: ProviderPreferenceEvent,
): Promise<{ ok: boolean; reason?: string }> {
  if (event.type !== "contact.updated" || event.unsubscribed !== true) return { ok: true };
  const recipient = validateEmailRecipient(event.email ?? "");
  if (!recipient.allowed || !event.svixId) return { ok: false, reason: "invalid_contact_event" };
  const email = recipient.normalized;
  const { data: profiles, error: findError } = await admin.from("user_profiles")
    .select("id").eq("billing_email", email).eq("role", "customer").limit(10);
  if (findError) return { ok: false, reason: "customer_lookup_failed" };
  for (const profile of profiles ?? []) {
    const customerId = String(profile.id);
    const { error: consentError } = await admin.from("marketing_email_consent_events").insert({
      customer_id: customerId, email, purpose: "promotional_email",
      decision: "withdrawn", source: "resend_contact_webhook",
      policy_version: MARKETING_POLICY_VERSION, evidence_reference: event.svixId,
    });
    if (consentError && consentError.code !== "23505")
      return { ok: false, reason: "consent_write_failed" };
    const { error: updateError } = await admin.from("user_profiles")
      .update({ marketing_emails_unsubscribed_at: new Date().toISOString() }).eq("id", customerId);
    if (updateError) return { ok: false, reason: "profile_update_failed" };
  }
  return { ok: true };
}
