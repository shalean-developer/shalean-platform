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
    .select("id").ilike("billing_email", email.replace(/[\\%_]/g, char => "\\" + char)).eq("role", "customer").limit(11);
  if (findError) return { ok: false, reason: "customer_lookup_failed" };
  if ((profiles?.length ?? 0) > 10) return { ok: false, reason: "ambiguous_customer_identity" };
  for (const profile of profiles ?? []) {
    const customerId = String(profile.id);
    const { data, error } = await admin.rpc("marketing_record_provider_withdrawal_atomic", {
      p_customer_id: customerId, p_email: email,
      p_evidence_reference: event.svixId, p_policy_version: MARKETING_POLICY_VERSION,
    });
    const outcome = Array.isArray(data) && data.length === 1 ? data[0]?.outcome : null;
    if (error || !["new", "replay_completed", "superseded"].includes(outcome))
      return { ok: false, reason: "provider_consent_transaction_failed" };
  }
  return { ok: true };
}
