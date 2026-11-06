import { SHALEAN_SUPABASE_REFS, supabaseRefFromUrl, type EnvLike } from "@/lib/env/deploymentEnvironment";

export const MARKETING_TEST_CUSTOMER = "6b891181-1822-44ee-b713-24b213db540a";
export const MARKETING_TEST_EMAIL = "marketing-acceptance-20261105@example.test";
export const MARKETING_TEST_ORIGIN = "https://pricing-test.shalean.co.za";

/** Not a production capability or a generic token issuer. Both safety switches must remain closed. */
export function marketingStagingEnabled(env: EnvLike = process.env) {
  return env.SHALEAN_APP_ENV === "staging"
    && supabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL) === SHALEAN_SUPABASE_REFS.staging
    && env.OUTBOUND_MESSAGING_DISABLED === "true"
    && env.RESEND_CONTACT_WRITES_DISABLED === "true";
}
