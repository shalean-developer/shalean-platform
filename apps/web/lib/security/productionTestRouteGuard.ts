import { resolveDeploymentEnvironment, type EnvLike } from "@/lib/env/deploymentEnvironment";

const STAGING_TEST_HOST = "pricing-test.shalean.co.za";
const LOCAL_TEST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function configuredPublicHost(env: EnvLike): string | null {
  for (const raw of [env.NEXT_PUBLIC_SITE_URL, env.NEXT_PUBLIC_APP_URL]) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Test/diagnostic API routes are executable only on explicitly known
 * non-production deployments.
 *
 * Production and preview are always blocked. Staging requires both the governed
 * deployment identity and the configured public staging origin. This avoids
 * trusting request.url behind Plesk/nginx while still failing closed if a
 * production runtime is accidentally labelled as staging.
 *
 * Local/development is restricted to loopback request hosts.
 */
export function isProductionTestRouteBlocked(
  requestUrl: string,
  env: EnvLike = process.env,
): boolean {
  const explicitIdentity = env.SHALEAN_APP_ENV?.trim().toLowerCase() ?? "";
  const deployment = resolveDeploymentEnvironment(env);

  // Self-hosted Next.js production builds run with NODE_ENV=production. If the
  // governed Shalean identity is missing, do not accept the resolver's local
  // fallback as evidence that real-write test tooling is safe.
  if (env.NODE_ENV === "production" && explicitIdentity !== "staging") {
    return true;
  }

  if (deployment === "production" || deployment === "preview") return true;

  if (deployment === "staging") {
    return configuredPublicHost(env) !== STAGING_TEST_HOST;
  }

  if (deployment === "development" || deployment === "local") {
    let host: string;
    try {
      host = new URL(requestUrl).hostname.toLowerCase();
    } catch {
      return true;
    }
    return !LOCAL_TEST_HOSTS.has(host);
  }

  return true;
}
