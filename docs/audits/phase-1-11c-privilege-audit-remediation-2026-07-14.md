# Phase 1.11C — Database Privilege Audit & Least-Privilege Remediation

| Field | Value |
|-------|-------|
| **Audit ID** | DBPRIV-2026-07-14 |
| **Phase** | 1.11C |
| **Date** | 2026-07-14 |
| **Mode** | Repository-first — **migrations prepared only**; no production connection; no apply |
| **Branch** | `fix/database-phase-111-security-hardening` |
| **Prior phases** | 1.11 audit · 1.11A RPC/storage · 1.11B views/retention/CASCADE comments |
| **Standards** | Formal SEOS docs still absent (F-GOV-001); applied Engineering Principles via least privilege, Architecture (service_role for servers), Security Engineering (Supabase checklist), Data Governance (no data drops), DoD (evidence-based REVOKE) |

---

## 1. Executive Summary

After 1.11A–B, **DEFINER RPC EXECUTE** and **admin views** are hardened, but baseline **table GRANT ALL** (including `TRUNCATE`) to `anon`/`authenticated` remained on ~170+ relations — including admin idempotency and ops tables. Defense relied almost entirely on RLS.

**Phase 1.11C** closes F-SEC-005 / DEBT-DB-004 for the **proven service_role-only** surface and removes catastrophic privileges from remaining client-facing tables, without migrating browser/RSC flows that legitimately use PostgREST + RLS.

| Deliverable | Location |
|-------------|----------|
| Migrations | `20260714130000` … `20260714130200` |
| Verification SQL | `docs/audits/phase-1-11c-verification.sql` |
| Compatibility | §10 below |
| Risk / debt | §11–12 |

**Not done in 1.11C (conscious deferral):** rewriting every remaining customer-table grant into minimal column-level GRANT SELECT-only matrices; Force RLS; dashboard_* roles (not in baseline grant dump).

---

## 2. Privilege inventory (baseline → post–1.11B → target)

### 2.1 Roles examined

| Role | Present in baseline grants | Notes |
|------|----------------------------|-------|
| `anon` | Yes — broad TABLE/FUNCTION/SEQUENCE | Public Data API |
| `authenticated` | Yes — broad TABLE/FUNCTION/SEQUENCE | JWT users |
| `service_role` | Yes — ALL on nearly everything | Server/edge/cron (bypasses RLS) |
| `postgres` | Schema USAGE + default privilege grantor | Migrations owner |
| `authenticator` / `dashboard_user` / `supabase_admin` | **No** grants in baseline dump | Supabase-managed; not altered |

### 2.2 Schemas

| Schema | USAGE to anon/authenticated | Action |
|--------|----------------------------|--------|
| `public` | Yes | **Retain** (required for PostgREST) |
| `storage` / `auth` / etc. | Managed by Supabase | Not modified |

### 2.3 Object classes

| Class | Baseline posture | 1.11A–B | 1.11C target |
|-------|------------------|---------|--------------|
| Tables (~173 baseline) | GRANT ALL → anon/auth (~163+) | Unchanged (except view grants) | **Service-only set**: REVOKE ALL from anon/auth; **others**: keep DML, strip TRUNCATE/TRIGGER/REFERENCES/MAINTAIN |
| Views (admin_*) | Mixed / weird non-SELECT grants | SELECT service_role + invoker | Already done |
| Materialized views | service_role-only (2) | OK | No change |
| Functions DEFINER | ALL → anon/auth | EXECUTE lockdown | Done in 1.11A |
| Functions INVOKER ops | ALL → anon/auth | Untouched | WhatsApp queue helpers → service_role only |
| Sequences | `bookings_reference_seq` ALL → anon/auth | Untouched | service_role only |
| Default privileges | ALL → anon/auth for tables/seqs/funcs | Untouched | **Revoked** for anon/auth |
| Extensions | N/A privileges on objects | — | No change |

### 2.4 Service_role-only revoke set (migration `…130000`)

~95 relations including: all `admin_*` idempotency/money tables, `system_*`, `cron_*`, `whatsapp_*`, `notification_*` (ops), `payout_*`, `failed_jobs`, conversion/dispatch internals, finance/expense deny tables, AI, campaign CMS, SEO/GSC/social, pricing audit tables, etc.

Full list: see SQL array in `20260714130000_phase_111c_revoke_service_role_only_table_grants.sql`.

### 2.5 Preserved client-facing privileges (DML kept; dangerous stripped)

Evidence-backed retention of GRANT SELECT/INSERT/UPDATE/DELETE as previously present (minus TRUNCATE/TRIGGER/REFERENCES/MAINTAIN):

| Relation | Why keep client grants |
|----------|------------------------|
| `blog_*`, `locations`, `services`, `faqs`, `pricing_services/extras/bundles/tiers` | Anon RSC `getSupabaseServer()` marketing/blog |
| `bookings`, `booking_line_items`, `booking_cleaners`, `booking_totals`, snapshots | Authenticated RLS + hooks/realtime |
| `user_profiles`, `customer_saved_addresses`, `user_notifications`, `user_push_tokens` | Browser / customer-mobile |
| `monthly_invoices`, `sales_documents`, `invoice_adjustments` | Customer account hooks |
| `cleaner_*` financial SELECT/UPDATE as per RLS | Cleaner authenticated policies |
| `dispatch_offers`, `recurring_bookings`, `cleaners`, `reviews`, `referrals*` | Authenticated policies + realtime |

---

## 3. Findings report

### Critical

| ID | Finding | Required state | Remediation |
|----|---------|----------------|-------------|
| **P-CRIT-001** | `admin_*` / payout / cron secret tables GRANT ALL to anon | No client privileges | Migration `…130000` |

### High

| ID | Finding | Required state | Remediation |
|----|---------|----------------|-------------|
| **P-HIGH-001** | Client `TRUNCATE` on most tables | No TRUNCATE for anon/auth | Migration `…130100` |
| **P-HIGH-002** | Default privileges auto-GRANT ALL to anon/auth | Defaults only for postgres/service_role | Migration `…130200` |
| **P-HIGH-003** | `cron_http_targets` / WhatsApp queue table grants | service_role only | `…130000` + WhatsApp function EXECUTE revoke |

### Medium

| ID | Finding | Required state | Remediation |
|----|---------|----------------|-------------|
| **P-MED-001** | `TRIGGER`/`REFERENCES`/`MAINTAIN` on client roles | Not required | `…130100` |
| **P-MED-002** | Invoker ops RPCs still executable by clients | service_role | `…130100` (WhatsApp helpers) |
| **P-MED-003** | Remaining customer tables still have broad INSERT/UPDATE/DELETE where RLS is the gate | Future tighten per-policy | **Deferred** |

### Low

| ID | Finding | Required state | Remediation |
|----|---------|----------------|-------------|
| **P-LOW-001** | Formal SEOS privilege chapter missing | Documented standard | Deferred (F-GOV-001) |
| **P-LOW-002** | Dashboard/authenticator role inventory not in dump | Monitor Supabase upgrades | Observation only |

---

## 4. Migration files

```text
supabase/migrations/20260714130000_phase_111c_revoke_service_role_only_table_grants.sql
supabase/migrations/20260714130100_phase_111c_strip_dangerous_client_table_privileges.sql
supabase/migrations/20260714130200_phase_111c_default_privileges_hardening.sql
```

Do **not** edit 1.11A–B or baseline migrations.

---

## 5. Verification SQL

[`phase-1-11c-verification.sql`](./phase-1-11c-verification.sql)

Local:

```powershell
cd C:\Users\info\shalean-platform
npm run db:migrations:validate
npx supabase db reset
npx supabase db query --local -f docs/audits/phase-1-11c-verification.sql
```

---

## 6. Rollback considerations

| Migration | Rollback |
|-----------|----------|
| `…130000` | Re-`GRANT ALL ON TABLE … TO anon, authenticated` for listed tables (emergency only) |
| `…130100` | Re-grant TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; restore sequence + WhatsApp function grants |
| `…130200` | Re-run baseline-style `ALTER DEFAULT PRIVILEGES … GRANT ALL … TO anon/authenticated` |

Prefer forward-fix if a missed client table breaks — grant that table specifically rather than rolling back the whole revoke set.

---

## 7. Compatibility assessment

| Surface | Expected impact |
|---------|-----------------|
| `getSupabaseAdmin()` / edge / cron | **None** — service_role retained |
| Marketing RSC (blog, home locations/services/faqs/pricing) | **None** — table grants preserved (dangerous privileges removed only) |
| Customer hooks (addresses, notifications, invoices, sales docs, profiles) | **None** for SELECT/INSERT/UPDATE/DELETE |
| Cleaner financial SELECT RLS | **None** |
| Direct PostgREST to `admin_*` / `system_logs` / `whatsapp_queue` with anon key | **Blocked** (intended) — already RLS-denied; now also privilege-denied |
| New tables created by `postgres` without explicit GRANT | Clients get **no** auto privileges — authors must GRANT + RLS deliberately |

**Regression checklist after approved local/staging apply:** home/blog load, account addresses CRUD, notifications, monthly invoices list, sales documents, cleaner offer realtime, admin booking create idempotency (service_role path).

---

## 8. Repository dependency method

- Client helpers classified: `getSupabaseAdmin` / `getSupabaseServer` / `getSupabaseBrowser` / customer-mobile JWT.
- `.from("…")` traced in hooks, blog/home libs, admin libs, edge functions.
- RLS `CREATE POLICY … TO authenticated|anon` used as lower bound for grant retention.
- No production queries; baseline + code only.

---

## 9. Approval gate

Awaiting approval before local mandatory reset verification beyond prepare, and before any remote apply.

---

## 10. Risk register additions

| Risk ID | Severity | Description |
|---------|----------|-------------|
| **RISK-DB-009** | High (mitigated by 1.11C) | Client GRANT ALL / TRUNCATE on ops tables |
| **RISK-DB-010** | Medium | Missed client table in revoke list could 42501 — mitigate with explicit GRANT restore |
| **RISK-DB-011** | Low | Future migrations forget explicit GRANT for new customer tables after default-privilege change |

---

## 11. Technical debt register updates

| Debt ID | Status after 1.11C prepare |
|---------|----------------------------|
| **DEBT-DB-004** | **Partially closed** — service-only revoke + strip + defaults; full per-table minimum GRANT matrix remains |
| **DEBT-DB-013** (new) | Narrow remaining authenticated grants to exact RLS verbs (SELECT-only where policies are SELECT-only) |
| **DEBT-DB-014** (new) | Inventory INVOKER trigger/helper EXECUTE surface beyond WhatsApp |
| **F-GOV-001** | Still open — SEOS privilege standard |

---

*End of Phase 1.11C package. Stop for approval.*
