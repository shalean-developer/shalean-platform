# Office dashboard three-layer audit

`npm run audit:office` (from repo root or `apps/web`) verifies every `/office` home metric across:

1. **UI** — Playwright capture of `data-testid` values on `/office`
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

### UI (Playwright)

- `OFFICE_AUDIT_BASE_URL` (e.g. `https://shalean.co.za` or `http://localhost:3000`)
- `OFFICE_AUDIT_ADMIN_EMAIL` + `OFFICE_AUDIT_ADMIN_PASSWORD`
  - or `OFFICE_AUDIT_STORAGE_STATE` (Playwright storage state JSON path)
- optional: `OFFICE_AUDIT_ADMIN_ACCESS_TOKEN` for live HTTP app-layer capture

### Optional

- `AUDIT_DATE=YYYY-MM-DD` (defaults to today in Africa/Johannesburg)
- `DISPATCH_SLA_BREACH_MINUTES` (defaults to 10)

## Reports

- `docs/audits/office/OFFICE-3-LAYER-AUDIT-YYYY-MM-DD.md`
- `docs/audits/office/evidence/OFFICE-3-LAYER-AUDIT-YYYY-MM-DD.json`
- `docs/audits/office/office-metric-registry.json`

## Safety

Read-only only: GET/HEAD. No booking mutations, assignments, notifications, payouts, Zoho writes, or payment-provider calls. Reports redact customer/cleaner identifiers, tokens, and credentials.
