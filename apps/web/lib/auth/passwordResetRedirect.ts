import "server-only";

import { isNonProductionDeployment, resolveDeploymentEnvironment } from "@/lib/env/deploymentEnvironment";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";

/** Stable staging branch alias used as Auth Site URL (UAT-01). */
export const STAGING_AUTH_ORIGIN =
  "https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app";

const PRODUCTION_APEX_HOSTS = new Set(["shalean.co.za", "www.shalean.co.za"]);

function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

function hostnameOf(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isProductionApex(origin: string): boolean {
  const host = hostnameOf(origin);
  return Boolean(host && PRODUCTION_APEX_HOSTS.has(host));
}

/**
 * Origin for password-reset / magic-link `redirectTo`.
 *
 * On staging/preview/development: never silently fall back to the production apex
 * (that would send recovery traffic off staging). Prefer explicit public URL env,
 * then the stable staging Auth origin when the deployment is staging.
 */
export function getPasswordResetRedirectBase(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const appUrl = normalizeOrigin(env.NEXT_PUBLIC_APP_URL ?? "");
  if (appUrl && !isLoopbackOrigin(appUrl)) {
    if (isNonProductionDeployment(env) && isProductionApex(appUrl)) {
      // Mis-set Preview env pointing at production — keep auth redirects on staging.
      if (resolveDeploymentEnvironment(env) === "staging") return STAGING_AUTH_ORIGIN;
    } else {
      return appUrl;
    }
  }

  const siteUrl = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL ?? "");
  if (siteUrl && !isLoopbackOrigin(siteUrl)) {
    if (isNonProductionDeployment(env) && isProductionApex(siteUrl)) {
      if (resolveDeploymentEnvironment(env) === "staging") return STAGING_AUTH_ORIGIN;
    } else {
      return siteUrl;
    }
  }

  if (resolveDeploymentEnvironment(env) === "staging") {
    return STAGING_AUTH_ORIGIN;
  }

  if (env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  const vercel = normalizeOrigin(env.VERCEL_URL ?? "");
  if (vercel && isNonProductionDeployment(env)) {
    const withScheme = /^https?:\/\//i.test(vercel) ? vercel : `https://${vercel}`;
    if (!isLoopbackOrigin(withScheme) && !isProductionApex(withScheme)) {
      return withScheme;
    }
  }

  return getPublicAppUrlBase();
}

/** True when a recovery `redirect_to` / action link targets production while we are on staging. */
export function passwordResetRedirectIsProductionLeak(
  redirectOrActionUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isNonProductionDeployment(env)) return false;
  try {
    const host = new URL(redirectOrActionUrl).hostname.toLowerCase();
    return PRODUCTION_APEX_HOSTS.has(host);
  } catch {
    return false;
  }
}
