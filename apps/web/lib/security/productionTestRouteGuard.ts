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
  const deployment = resolveDeploymentEnvironment(env);
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
