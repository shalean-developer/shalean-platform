import { resolveDeploymentEnvironment, type EnvLike } from "@/lib/env/deploymentEnvironment";

const STAGING_TEST_HOSTS = new Set(["pricing-test.shalean.co.za"]);
const LOCAL_TEST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Test/diagnostic API routes are executable only on explicitly known
 * non-production origins.
 *
 * Production is always blocked. Staging is allowlisted to the canonical
 * pricing-test host. Local/development is restricted to loopback hosts.
 * Preview and unknown deployment identities fail closed.
 *
 * Compiled staging runtimes commonly use NODE_ENV=production, so NODE_ENV must
 * not be used to distinguish Shalean staging from customer production.
 */
export function isProductionTestRouteBlocked(
  requestUrl: string,
  env: EnvLike = process.env,
): boolean {
  const deployment = resolveDeploymentEnvironment(env);
  if (deployment === "production" || deployment === "preview") return true;

  let host: string;
  try {
    host = new URL(requestUrl).hostname.toLowerCase();
  } catch {
    return true;
  }

  if (deployment === "staging") {
    return !STAGING_TEST_HOSTS.has(host);
  }

  if (deployment === "development" || deployment === "local") {
    return !LOCAL_TEST_HOSTS.has(host);
  }

  return true;
}
