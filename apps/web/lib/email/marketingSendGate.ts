import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEmailRecipient } from "@/lib/email/recipientSafety";
import { decideMarketingEligibility } from "@/lib/email/marketingEligibility";

type GateResult = { allowed: true } | { allowed: false; reason: string };
/** Only call for promotional emails. No network writes, no send-side effects.
 * Provider sync must be explicitly verified and fresh before any promotion is eligible.
 * Without an activated local consent ledger and provider mirror, all marketing fails closed.
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
    // A provider mirror/reconciler is required for launch. Do not guess provider status.
    return decideMarketingEligibility({
      recipientValid: true,
      customerIdentityVerified: Boolean(isCustomer && verifiedEmail),
      consent: consent.data?.decision === "granted" ? "granted" : consent.data?.decision === "withdrawn" ? "denied" : "unknown",
      crmUnsubscribed: p?.marketing_emails_unsubscribed_at == null ? false : true,
      locallySuppressed: Boolean(suppression.data),
      providerStateFresh: false,
      providerUnsubscribed: null,
      providerSuppressed: null,
    });
  } catch {
    return { allowed: false, reason: "eligibility_lookup_failed" };
  }
}
