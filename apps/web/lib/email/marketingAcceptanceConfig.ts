import { SHALEAN_SUPABASE_REFS, supabaseRefFromUrl, type EnvLike } from "@/lib/env/deploymentEnvironment";

/** Private recipient configuration; never baked into NEXT_PUBLIC variables or source. */
export function marketingAcceptanceRecipients(env: EnvLike = process.env): string[] {
  if (env.SHALEAN_APP_ENV !== "staging" || supabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL) !== SHALEAN_SUPABASE_REFS.staging) return [];
  const list = (env.MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST ?? "").split(",").map(s => s.trim().toLowerCase());
  if (list.length !== 2 || new Set(list).size !== 2 || list.some(s => !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s))) return [];
  return list;
}
export function marketingAcceptanceHost(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? url.hostname;
  return url.protocol === "https:" && url.hostname === "pricing-test.shalean.co.za" && host === url.hostname;
}
