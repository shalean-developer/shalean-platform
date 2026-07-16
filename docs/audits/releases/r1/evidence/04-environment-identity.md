# Production Environment Identity Evidence

Source: GET /api/health/environment fetched directly on the new production deployment
(immutable URL shalean-platform-5u6u0za3x-shalean-cleaning-services.vercel.app) via Vercel
authenticated fetch — X-Vercel-Cache: MISS, HTTP 200, X-Matched-Path: /api/health/environment.

Timestamp: 2026-07-16T17:10:42Z

## Response (sanitized — endpoint exposes no secrets, only masked prefixes)
```json
{
  "status": "ok",
  "service": "shalean-environment",
  "deployment": "production",
  "vercelEnv": "production",
  "gitBranch": "main",
  "shaleanAppEnv": "production",
  "supabase": {
    "configuredRef": "tchayecuvzssixyxlvfu",
    "expectedRef": "tchayecuvzssixyxlvfu",
    "urlHost": "tchayecuvzssixyxlvfu.supabase.co"
  },
  "paystack": {
    "secretMode": "live",
    "publicMode": "live",
    "secretPrefix": "sk_live_…",
    "publicPrefix": "pk_live_…"
  },
  "messaging": {
    "outboundDisabled": false,
    "emailAllowlistConfigured": false,
    "phoneAllowlistConfigured": false,
    "smsOutboundEnabled": false
  },
  "issues": []
}
```

## Verification checklist
- environment = production ✓
- Supabase ref = tchayecuvzssixyxlvfu (configured == expected) ✓
- Paystack = live (secret + public), NO test mode ✓
- production site: gitBranch=main, deployment=production ✓
- messaging configuration present; smsOutboundEnabled=false (SMS/WhatsApp NOT enabled — matches release constraints) ✓
- no staging banner / no staging Supabase reference ✓
- issues: [] (collectEnvironmentSafetyIssues found no misconfiguration) ✓
- No secrets exposed (only masked sk_live_… / pk_live_… prefixes) ✓

## CRON_SECRET
- Verified separately via cron route auth-rejection test (see 06-smoke-cron evidence).

DECISION: Environment identity CORRECT — no mismatch.
