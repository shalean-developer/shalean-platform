import {
  classifyPaystackPublicMode,
  classifyPaystackSecretMode,
  collectEnvironmentSafetyIssues,
  maskPaystackKeyPrefix,
} from "@/lib/env/assertEnvironmentSafety";
import {
  expectedSupabaseRefForDeployment,
  resolveDeploymentEnvironment,
  supabaseRefFromUrl,
} from "@/lib/env/deploymentEnvironment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Environment identity health (no secrets). Used to prove branch ↔ DB ↔ payment mode mapping.
 */
export function GET(): Response {
  const deployment = resolveDeploymentEnvironment();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const actualRef = supabaseRefFromUrl(supabaseUrl);
  const expectedRef = expectedSupabaseRefForDeployment(deployment);
  const issues = collectEnvironmentSafetyIssues();
  const ok = issues.length === 0;

  const body = {
    status: ok ? "ok" : "misconfigured",
    service: "shalean-environment",
    timestamp: new Date().toISOString(),
    deployment,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    shaleanAppEnv: process.env.SHALEAN_APP_ENV ?? null,
    supabase: {
      configuredRef: actualRef,
      expectedRef,
      urlHost: (() => {
        try {
          return supabaseUrl ? new URL(supabaseUrl).hostname : null;
        } catch {
          return null;
        }
      })(),
    },
    paystack: {
      secretMode: classifyPaystackSecretMode(),
      publicMode: classifyPaystackPublicMode(),
      secretPrefix: maskPaystackKeyPrefix(process.env.PAYSTACK_SECRET_KEY),
      publicPrefix: maskPaystackKeyPrefix(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY),
    },
    messaging: {
      outboundDisabled: (process.env.OUTBOUND_MESSAGING_DISABLED ?? "").toLowerCase() === "true",
      emailAllowlistConfigured: Boolean(process.env.OUTBOUND_EMAIL_ALLOWLIST?.trim()),
      phoneAllowlistConfigured: Boolean(process.env.OUTBOUND_PHONE_ALLOWLIST?.trim()),
      smsOutboundEnabled: process.env.SMS_OUTBOUND_ENABLED === "true",
    },
    issues,
  };

  return Response.json(body, { status: ok ? 200 : 503 });
}
