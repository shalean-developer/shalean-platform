export type AuthoritativePricingNodeEnv = "production" | "development" | "test" | string | undefined;

/**
 * SR-04D: static/default pricing is a local-development convenience only.
 * Production must have the authoritative Supabase pricing client available;
 * otherwise checkout must fail closed rather than sign fallback pricing.
 */
export function assertAuthoritativePricingClientAvailable(params: {
  adminAvailable: boolean;
  nodeEnv: AuthoritativePricingNodeEnv;
}): void {
  if (params.adminAvailable) return;
  if (params.nodeEnv !== "production") return;

  throw new Error(
    "Authoritative booking pricing could not be loaded because the authoritative Supabase pricing client is unavailable.",
  );
}
