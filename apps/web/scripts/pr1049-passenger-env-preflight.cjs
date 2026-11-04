'use strict';
// Standalone PR1049 preflight. No imports, networking, state changes, or server startup.
// Output contains fixed PASS/FAIL labels only. Do not print process.env or exceptions.
const REQUIRED = Object.freeze({
  SHALEAN_APP_ENV: 'staging',
  SHALEAN_ENFORCE_ENV_SAFETY: 'true',
  SHALEAN_EXPECTED_SUPABASE_REF: 'uwvnmluiqbczeduzjgse',
  NEXT_PUBLIC_SUPABASE_URL: 'https://uwvnmluiqbczeduzjgse.supabase.co',
  SUPABASE_URL: 'https://uwvnmluiqbczeduzjgse.supabase.co',
  NEXT_PUBLIC_SITE_URL: 'https://pr1049-test.shalean.co.za',
  NEXT_PUBLIC_APP_URL: 'https://pr1049-test.shalean.co.za',
  OUTBOUND_MESSAGING_DISABLED: 'true',
  NEXT_TELEMETRY_DISABLED: '1'
});
const FORBIDDEN = Object.freeze([
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY','PAYSTACK_SECRET_KEY',
  'PAYSTACK_SECRET','CRON_SECRET','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN',
  'ZOHO_ACCESS_TOKEN','RESEND_API_KEY','FLAXXA_API_KEY','FLAXXA_TOKEN',
  'WHATSAPP_ACCESS_TOKEN','WAPI_API_KEY','SMTP_PASSWORD','DATABASE_URL',
  'SUPABASE_DB_URL','DIRECT_URL','SUPABASE_ACCESS_TOKEN'
]);
function evaluate(env) {
  const checks = Object.entries(REQUIRED).map(([name, expected]) => ({
    label: name,
    pass: typeof env[name] === 'string' && env[name].trim() === expected
  }));
  const allForbiddenAbsent = FORBIDDEN.every(name => !String(env[name] || '').trim());
  checks.push({label:'forbidden_credentials_absent',pass:allForbiddenAbsent});
  const sensitiveName = /(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|DATABASE_URL|DB_URL|CONNECTION_STRING)/i;
  const unknownSensitiveAbsent = Object.keys(env).every(name =>
    FORBIDDEN.includes(name) || !sensitiveName.test(name) || !String(env[name] || '').trim());
  checks.push({label:'other_sensitive_credentials_absent',pass:unknownSensitiveAbsent});
  return checks;
}
function report(env, print=console.log) {
  const checks=evaluate(env);
  for(const item of checks) print(item.label+': '+(item.pass?'PASS':'FAIL'));
  const ok=checks.every(x=>x.pass);
  print('PR1049_PREFLIGHT: '+(ok?'PASS':'FAIL'));
  return ok;
}
module.exports={evaluate,report};
if(require.main===module) process.exitCode=report(process.env)?0:1;
