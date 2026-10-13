// AUDIT-03A-02B.2: credential-free private runner preflight.
// Standalone Node 24 script; no imports, network calls or filesystem writes.
const REQUIRED = Object.freeze([
  "ZOHO_CLIENT_ID",
  "ZOHO_CLIENT_SECRET",
  "ZOHO_REFRESH_TOKEN",
  "ZOHO_ORGANIZATION_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
]);

export function summarizeEnvironment(env) {
  const present = Object.fromEntries(REQUIRED.map((key) => [key, typeof env[key] === "string" && env[key].length > 0]));
  const expected = "https://uwvnmluiqbczeduzjgse.supabase.co";
  return {
    audit: "AUDIT-03A-02B.2",
    mode: "staging-private-preflight",
    checks: present,
    stagingEnvironment: env.SHALEAN_APP_ENV === "staging",
    stagingSupabaseMatch: env.NEXT_PUBLIC_SUPABASE_URL === expected,
    zohoOrgMatch: env.ZOHO_ORGANIZATION_ID === "927500285",
    networkCalls: 0,
    writes: 0,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = summarizeEnvironment(process.env);
  process.stdout.write(JSON.stringify(result) + "\n");
  if (!result.stagingEnvironment || !result.stagingSupabaseMatch || !result.zohoOrgMatch || Object.values(result.checks).some((ok) => !ok)) {
    process.exitCode = 2; // Intentionally fail closed; no financial action.
  }
}
