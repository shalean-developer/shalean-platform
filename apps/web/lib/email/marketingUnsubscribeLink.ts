import type { SupabaseClient } from "@supabase/supabase-js";
import { createMarketingUnsubscribeUrl, validGeneration } from "./marketingUnsubscribeToken";

/** Read-only issuance; missing schema, identity or generation fails closed. */
export async function createCustomerMarketingUnsubscribeUrl(
  admin: SupabaseClient | null, origin: string, customerId: string,
  email: string, secret: string | undefined,
): Promise<string | null> {
  if (!admin) return null;
  try {
    const { data, error } = await admin.from("user_profiles")
      .select("role, billing_email, marketing_consent_generation")
      .eq("id", customerId).maybeSingle();
    if (error || data?.role !== "customer" ||
        data.billing_email?.trim().toLowerCase() !== email.trim().toLowerCase() ||
        !validGeneration(data.marketing_consent_generation)) return null;
    return createMarketingUnsubscribeUrl(origin, customerId, secret, data.marketing_consent_generation);
  } catch { return null; }
}
