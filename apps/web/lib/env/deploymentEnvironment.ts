/**
 * Deployment environment identity for Shalean web.
 *
 * Prefer explicit `SHALEAN_APP_ENV` (production | staging | development).
 * Fall back to Vercel git branch, then VERCEL_ENV, then local.
 *
 * Note: the dedicated Supabase development project was retired in August 2026.
 * The `development` identity remains valid for local/preview safety labelling,
 * but it no longer has a canonical remote Supabase project ref.
 */

export type ShaleanDeploymentEnv =
  | "production"
  | "staging"
  | "development"
  | "preview"
  | "local";

/** Canonical Supabase project refs for active governed remote environments (never secrets). */
export const SHALEAN_SUPABASE_REFS = {
  production: "tchayecuvzssixyxlvfu",
  /** Persistent dedicated staging project. */
  staging: "gbgnemlpyykyhpqqbgru",
} as const;

export type EnvLike = Record<string, string | undefined>;

function normalizeExplicit(raw: string | undefined): ShaleanDeploymentEnv | null {
  const v = raw?.trim().toLowerCase();
  if (v === "production" || v === "prod") return "production";
  if (v === "staging" || v === "stage") return "staging";
  if (v === "development" || v === "dev") return "development";
  if (v === "preview") return "preview";
  if (v === "local") return "local";
  return null;
}

export function resolveDeploymentEnvironment(env: EnvLike = process.env): ShaleanDeploymentEnv {
  const explicit = normalizeExplicit(env.SHALEAN_APP_ENV);
  if (explicit) return explicit;

  const ref = (env.VERCEL_GIT_COMMIT_REF ?? "").trim().toLowerCase();
  if (ref === "main" || ref === "master") return "production";
  if (ref === "staging") return "staging";
  // The Git `development` branch is now a normal Vercel Preview deployment.
  // It must not imply a dedicated remote Supabase project.
  if (ref === "development") return "preview";

  const vercelEnv = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development") return "development";

  if (env.NODE_ENV === "production" && env.VERCEL === "1") return "preview";
  return "local";
}

export function isCustomerFacingProduction(env: EnvLike = process.env): boolean {
  return resolveDeploymentEnvironment(env) === "production";
}

export function isNonProductionDeployment(env: EnvLike = process.env): boolean {
  return !isCustomerFacingProduction(env);
}

/** Visible marker for deliberately delivered non-production messages. */
export function outboundTestMessageMarker(env: EnvLike = process.env): string | null {
  const deployment = resolveDeploymentEnvironment(env);
  if (deployment === "staging") return "[SHALEAN STAGING — TEST]";
  if (deployment === "development" || deployment === "preview" || deployment === "local") {
    return "[SHALEAN DEVELOPMENT — TEST]";
  }
  return null;
}

export function pageTitleEnvironmentSuffix(env: EnvLike = process.env): string | null {
  const deployment = resolveDeploymentEnvironment(env);
  if (deployment === "staging") return "STAGING";
  if (deployment === "development") return "DEVELOPMENT";
  if (deployment === "preview") return "PREVIEW";
  if (deployment === "local") return "LOCAL";
  return null;
}

/** Extract Supabase project ref from URL (hostname subdomain). */
export function supabaseRefFromUrl(url: string | undefined | null): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const m = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function expectedSupabaseRefForDeployment(
  deployment: ShaleanDeploymentEnv = resolveDeploymentEnvironment(),
): string | null {
  if (deployment === "production") return SHALEAN_SUPABASE_REFS.production;
  if (deployment === "staging") return SHALEAN_SUPABASE_REFS.staging;
  // Development/preview/local are intentionally unbound from a canonical remote project.
  return null;
}

export function customerProductionHosts(): readonly string[] {
  return ["shalean.co.za", "www.shalean.co.za", "shalean.com", "www.shalean.com"];
}

export function isCustomerProductionHost(host: string | null | undefined): boolean {
  const h = (host ?? "").split(":")[0]?.toLowerCase() ?? "";
  return (customerProductionHosts() as readonly string[]).includes(h);
}
