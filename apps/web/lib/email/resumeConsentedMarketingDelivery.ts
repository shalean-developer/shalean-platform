import type { SupabaseClient } from "@supabase/supabase-js";
import { readResendMarketingState } from "./readResendMarketingState";

/** Read-only provider verification followed by a fenced local transaction.
 * Does not subscribe a provider contact, lift suppression or send an email.
 */
export async function resumeConsentedMarketingDelivery(
  admin: SupabaseClient,
  input: { customerId: string; email: string; evidenceReference: string; apiKey?: string },
): Promise<boolean> {
  try {
    const { data: profile, error } = await admin.from("user_profiles")
      .select("marketing_consent_generation").eq("id", input.customerId).maybeSingle();
    if (error || !Number.isSafeInteger(profile?.marketing_consent_generation)
        || profile.marketing_consent_generation < 1) return false;
    const provider = await readResendMarketingState(input.email, input.apiKey);
    if (!provider.verified || provider.unsubscribed !== false || provider.suppressed !== false)
      return false;
    const { data, error: resumeError } = await admin.rpc("marketing_resume_consented_delivery_atomic", {
      p_customer_id: input.customerId, p_email: input.email,
      p_generation: profile.marketing_consent_generation,
      p_evidence_reference: input.evidenceReference,
    });
    return !resumeError && data === true;
  } catch { return false; }
}
