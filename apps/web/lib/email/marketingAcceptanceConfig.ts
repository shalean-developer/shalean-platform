import { SHALEAN_SUPABASE_REFS, supabaseRefFromUrl, type EnvLike } from "@/lib/env/deploymentEnvironment";

/** Private recipient configuration; never baked into NEXT_PUBLIC variables or source. */
export function marketingAcceptanceRecipients(env: EnvLike = process.env): string[] {
  if (env.SHALEAN_APP_ENV !== "staging" || supabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL) !== SHALEAN_SUPABASE_REFS.staging) return [];
  const list = (env.MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST ?? "").split(",").map(s => s.trim().toLowerCase());
  if (list.length !== 2 || new Set(list).size !== 2 || list.some(s => !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s))) return [];
  return list;
}
export function marketingAcceptanceHost(request: Request) {
  // Next may construct request.url from its internal listener behind Plesk.
  // Match the actual routing Host, as the existing staging fixture routes do;
  // never use caller-supplied x-forwarded-host as an authorization signal.
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? new URL(request.url).hostname;
  return host === "pricing-test.shalean.co.za";
}

/** Separate bounded capability. Never turn on the shared outbound/contact switches. */
export function marketingAcceptanceSendEnabled(env: EnvLike = process.env): boolean {
  return marketingAcceptanceRecipients(env).length === 2
    && env.MARKETING_ACCEPTANCE_SEND_ENABLED === "true"
    && env.OUTBOUND_MESSAGING_DISABLED === "true"
    && env.RESEND_CONTACT_WRITES_DISABLED === "true"
    && Boolean(env.RESEND_STAGING_WEBHOOK_SECRET)
    && Boolean(env.MARKETING_UNSUBSCRIBE_SECRET && env.MARKETING_UNSUBSCRIBE_SECRET.length >= 32);
}
