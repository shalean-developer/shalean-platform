import {
  isCustomerFacingProduction,
  type EnvLike,
} from "@/lib/env/deploymentEnvironment";

/**
 * SPC-01-04 SR-04D2: static/default Booking V2 pricing is allowed only outside
 * canonical customer-facing production. Real production must have the
 * authoritative Supabase pricing client available so the catalog fails closed
 * instead of presenting fallback prices as live pricing.
 */
export function assertAuthoritativePricingClientAvailable(params: {
  adminAvailable: boolean;
  env?: EnvLike;
}): void {
  if (params.adminAvailable) return;
  if (!isCustomerFacingProduction(params.env ?? process.env)) return;

  throw new Error(
    "Authoritative booking pricing could not be loaded because the authoritative Supabase pricing client is unavailable.",
  );
}
