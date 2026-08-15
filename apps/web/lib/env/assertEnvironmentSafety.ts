import {
  expectedSupabaseRefForDeployment,
  isCustomerProductionHost,
  resolveDeploymentEnvironment,
  SHALEAN_SUPABASE_REFS,
  supabaseRefFromUrl,
  type EnvLike,
  type ShaleanDeploymentEnv,
} from "./deploymentEnvironment";

export type PaystackKeyMode = "live" | "test" | "unknown" | "missing";

export type EnvironmentSafetyIssue = {
  code:
    | "env_identity_unknown"
    | "paystack_live_in_non_production"
    | "paystack_test_in_production"
    | "paystack_mode_unknown"
    | "paystack_public_secret_mismatch"
    | "supabase_ref_mismatch"
    | "supabase_production_ref_in_non_production"
    | "customer_host_outside_production";
  message: string;
};

function modeFromSecret(secret: string): PaystackKeyMode {
  if (!secret) return "missing";
  if (secret.startsWith("sk_live_")) return "live";
  if (secret.startsWith("sk_test_")) return "test";
  return "unknown";
}

function modeFromPublic(pub: string): PaystackKeyMode {
  if (!pub) return "missing";
  if (pub.startsWith("pk_live_")) return "live";
  if (pub.startsWith("pk_test_")) return "test";
  return "unknown";
}

export function classifyPaystackSecretMode(env: EnvLike = process.env): PaystackKeyMode {
  return modeFromSecret((env.PAYSTACK_SECRET_KEY ?? "").trim());
}

export function classifyPaystackPublicMode(env: EnvLike = process.env): PaystackKeyMode {
  return modeFromPublic((env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "").trim());
}

export function maskPaystackKeyPrefix(key: string | undefined | null): string {
  const k = (key ?? "").trim();
  if (!k) return "(unset)";
  if (k.startsWith("sk_live_")) return "sk_live_…";
  if (k.startsWith("sk_test_")) return "sk_test_…";
  if (k.startsWith("pk_live_")) return "pk_live_…";
  if (k.startsWith("pk_test_")) return "pk_test_…";
  return `${k.slice(0, 6)}…`;
}

function governedIdentity(deployment: ShaleanDeploymentEnv): boolean {
  return deployment === "production" || deployment === "staging" || deployment === "development";
}

/**
 * Fail-closed payment + database identity checks.
 * Returns issues that must block payment/init on misconfiguration.
 */
export function collectEnvironmentSafetyIssues(env: EnvLike = process.env): EnvironmentSafetyIssue[] {
  const issues: EnvironmentSafetyIssue[] = [];
  const deployment = resolveDeploymentEnvironment(env);
  const onVercel = env.VERCEL === "1" || Boolean(env.VERCEL_ENV);

  if (onVercel && !env.SHALEAN_APP_ENV?.trim() && !env.VERCEL_GIT_COMMIT_REF?.trim()) {
    issues.push({
      code: "env_identity_unknown",
      message: "Deployment environment identity cannot be determined (set SHALEAN_APP_ENV).",
    });
  }

  const secretMode = classifyPaystackSecretMode(env);
  const publicMode = classifyPaystackPublicMode(env);

  if (secretMode === "unknown") {
    issues.push({
      code: "paystack_mode_unknown",
      message: "PAYSTACK_SECRET_KEY mode cannot be classified (expected sk_live_ or sk_test_).",
    });
  }

  if (
    publicMode !== "missing" &&
    secretMode !== "missing" &&
    publicMode !== "unknown" &&
    secretMode !== "unknown" &&
    publicMode !== secretMode
  ) {
    issues.push({
      code: "paystack_public_secret_mismatch",
      message: `Paystack public key is ${publicMode} but secret key is ${secretMode}.`,
    });
  }

  if (deployment === "production") {
    if (secretMode === "test") {
      issues.push({
        code: "paystack_test_in_production",
        message: "Production must use Paystack live keys only.",
      });
    }
  } else if (governedIdentity(deployment) || deployment === "preview" || deployment === "local") {
    if (secretMode === "live") {
      issues.push({
        code: "paystack_live_in_non_production",
        message: `${deployment} must use Paystack test keys only (live key detected).`,
      });
    }
  }

  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim();
  const actualRef = supabaseRefFromUrl(supabaseUrl);
  const expectedRef = expectedSupabaseRefForDeployment(deployment);
  if (expectedRef && actualRef && actualRef !== expectedRef) {
    issues.push({
      code: "supabase_ref_mismatch",
      message: `${deployment} is connected to Supabase ref ${actualRef}; expected ${expectedRef}.`,
    });
  }

  if (deployment !== "production" && actualRef === SHALEAN_SUPABASE_REFS.production) {
    issues.push({
      code: "supabase_production_ref_in_non_production",
      message: `${deployment} must not connect to the production Supabase project.`,
    });
  }

  const host = (env.VERCEL_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  let hostname: string | null = null;
  try {
    hostname = host.includes("://") ? new URL(host).hostname : host.split("/")[0] ?? null;
  } catch {
    hostname = null;
  }
  if (hostname && isCustomerProductionHost(hostname) && deployment !== "production") {
    issues.push({
      code: "customer_host_outside_production",
      message: `Customer production host ${hostname} is configured outside production (${deployment}).`,
    });
  }

  return issues;
}

export function assertEnvironmentPaymentSafety(env: EnvLike = process.env): EnvironmentSafetyIssue | null {
  const issues = collectEnvironmentSafetyIssues(env).filter((i) =>
    i.code.startsWith("paystack_") ||
    i.code === "env_identity_unknown" ||
    i.code === "supabase_ref_mismatch" ||
    i.code === "supabase_production_ref_in_non_production",
  );
  return issues[0] ?? null;
}
