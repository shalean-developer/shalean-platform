import {
  isCustomerProductionHost,
  resolveDeploymentEnvironment,
  type EnvLike,
} from "@/lib/env/deploymentEnvironment";

/**
 * Test/diagnostic API routes are never executable on customer production.
 *
 * We intentionally check both the governed deployment identity and the request
 * hostname. The host check fails closed if deployment metadata drifts, while
 * the deployment check keeps production disabled even behind an alternate host.
 *
 * Compiled staging runtimes commonly use NODE_ENV=production, so NODE_ENV must
 * not be used to distinguish Shalean staging from customer production.
 */
export function isProductionTestRouteBlocked(
  requestUrl: string,
  env: EnvLike = process.env,
): boolean {
  if (resolveDeploymentEnvironment(env) === "production") return true;

  try {
    return isCustomerProductionHost(new URL(requestUrl).host);
  } catch {
    // A malformed/unknown request origin cannot prove that this is a safe
    // non-production host, so test tooling fails closed.
    return true;
  }
}
