import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";
import { decideMarketingEligibility } from "@/lib/email/marketingEligibility";
import { readResendMarketingState } from "@/lib/email/readResendMarketingState";

type GateResult = { allowed: true } | { allowed: false; reason: string };
/** Only call for promotional emails. No network writes, no send-side effects.
 * Resend contact/suppression state is checked live and fails closed on outage.
 * Until explicit consents are captured and migrated, marketing is denied.
 */
export async function checkMarketingSendGate(
  admin: SupabaseClient, customerId: string | null, rawEmail: string,
): Promise<GateResult> {
  const normalized = validateEmailRecipient(rawEmail);
  if (!normalized.allowed) return { allowed: false, reason: normalized.reason };
  if (!customerId) return { allowed: false, reason: "unverified_customer" };
  const email = normalized.normalized;
  try {
    const [profile, consent, suppression] = await Promise.all([
      admin.from("user_profiles").select("id, role, billing_email, marketing_emails_unsubscribed_at").eq("id", customerId).maybeSingle(),
      admin.from("marketing_email_consent_events").select("decision, occurred_at").eq("customer_id", customerId).eq("email", email).eq("purpose", "promotional_email").order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("email_suppressions").select("email").eq("email", email).maybeSingle(),
    ]);
    if (profile.error || consent.error || suppression.error)
      return { allowed: false, reason: "eligibility_lookup_failed" };
    const p = profile.data;
    const isCustomer = p?.role === "customer";
    const verifiedEmail = p?.billing_email?.trim().toLowerCase() === email;
    // Provider state is fetched read-only. Outage or missing contact fails closed.
    const provider = await readResendMarketingState(email, process.env.RESEND_API_KEY);
    return decideMarketingEligibility({
      recipientValid: true,
      customerIdentityVerified: Boolean(isCustomer && verifiedEmail),
      consent: consent.data?.decision === "granted" ? "granted" : consent.data?.decision === "withdrawn" ? "denied" : "unknown",
      crmUnsubscribed: p?.marketing_emails_unsubscribed_at == null ? false : true,
      locallySuppressed: Boolean(suppression.data),
      providerStateFresh: provider.verified,
      providerUnsubscribed: provider.unsubscribed,
      providerSuppressed: provider.suppressed,
    });
  } catch {
    return { allowed: false, reason: "eligibility_lookup_failed" };
  }
}
