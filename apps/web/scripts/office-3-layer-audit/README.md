# Office dashboard three-layer audit (infrastructure)

`npm run audit:office` (from repo root or `apps/web`) is **audit infrastructure only**.
It does **not** certify that `/office` is 100% accurate until a full three-layer run
returns `GO` with every required metric `PASS`.

Current stance: **NO-GO — OFFICE DASHBOARD NOT YET VERIFIED 100% ACCURATE** until UI credentials
are provided and all metrics (except documented `system_health` authority gaps) pass.

Layers:

1. **UI** — Playwright capture of aggregate `data-testid` values on `/office`
2. **Application** — admin API helpers / optional HTTP (`/api/admin/schedule/day`, `/api/admin/ops-snapshot`, `/api/admin/dashboard-stats`)
3. **Database** — independently re-implemented read-only calculations (not imports of the dashboard aggregators)

## Required env

```bash
OFFICE_AUDIT_READ_ONLY=true
OFFICE_AUDIT_TARGET=local   # or production
```

Production runs are refused unless `OFFICE_AUDIT_READ_ONLY=true`.

### Database / application

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### UI (Playwright) — restricted audit-admin account

- `OFFICE_AUDIT_BASE_URL` (e.g. `https://shalean.co.za` or `http://localhost:3000`)
- `OFFICE_AUDIT_ADMIN_EMAIL` + `OFFICE_AUDIT_ADMIN_PASSWORD`
  - or `OFFICE_AUDIT_STORAGE_STATE` (Playwright storage state JSON path)
- optional: `OFFICE_AUDIT_ADMIN_ACCESS_TOKEN` for live HTTP app-layer capture

Use a **restricted audit-admin** account (read office dashboards only). Do not use a full
operator account with payout/assign powers for routine audit runs.

### Optional

- `AUDIT_DATE=YYYY-MM-DD` (defaults to today in Africa/Johannesburg)
- `DISPATCH_SLA_BREACH_MINUTES` (defaults to 10)

## Reports

- `docs/audits/office/OFFICE-3-LAYER-AUDIT-YYYY-MM-DD.md`
- `docs/audits/office/evidence/OFFICE-3-LAYER-AUDIT-YYYY-MM-DD.json`
- `docs/audits/office/office-metric-registry.json`

## Safety

- HTTP via `createReadOnlyFetch`: GET/HEAD only (blocks Supabase REST mutations).
- Playwright route guard: aborts non-GET/HEAD except auth/session establishment.
- No booking mutations, assignments, notifications, payouts, Zoho writes, or payment-provider calls.
- Reports redact customer/cleaner identifiers, tokens, and credentials.
- Incomplete evidence (`BLOCKED`, `NOT AUTHORITATIVE`, `FAIL`, …) exits nonzero (`1`).
- `summary.system_health` remains **NOT AUTHORITATIVE** until an independent health source exists.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All required metrics `PASS` and decision `GO` |
| `1` | Audit completed with NO-GO / incomplete evidence / mismatches |
| `2` | Misconfiguration / hard failure (missing env, refused production without read-only, etc.) |
