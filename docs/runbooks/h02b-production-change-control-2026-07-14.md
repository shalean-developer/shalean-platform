# H02B Production Change Control Record

## Change Identification

| Field | Value |
|-------|-------|
| Change ID | `PENDING-CHANGE-ID` |
| Title | H02B Production Migration-History Reconciliation and Phase 1.11 Security Remediation |
| Classification | High-risk controlled database security remediation |
| Affected system | Supabase Postgres (migration history + privileges / storage / functions / views / sequences / default privileges) |
| Production project | `shalean-platform` (`tchaye****xlvfu`, `eu-west-3`) |
| Repository | `shalean-platform` |
| Branch | `main` |
| Commit | `99526d72fca841fdc189eaf33720655a564675b0` |
| Change owner | Farai Chitekedza |
| Requested execution date | PENDING |
| Current decision | **NO-GO — OPERATIONAL PREREQUISITES INCOMPLETE** |
| Record updated at | 2026-07-14T16:50:00+02:00 (Africa/Johannesburg) |

## Business Purpose

- Reconcile governed Git migration history with production `schema_migrations` history using Model B.
- Avoid executing the production baseline SQL against populated production.
- Apply Phase 1.11 database security hardening (A/B/C).
- Remove dangerous client privileges (e.g. TRUNCATE / TRIGGER / REFERENCES on client roles).
- Harden storage policies, function EXECUTE grants, admin views, sequences, and default privileges.

## Approved Technical Scope

1. Mark the **12** approved archaeology versions **reverted** (history only).
2. Mark baseline `20260714010000` **applied without executing SQL**.
3. Require a dry-run showing **exactly eight** Phase 1.11 migrations (baseline absent).
4. Deploy **exactly** those eight migrations (single gated push; no `--include-all`).
5. Immediately perform H02C verification SQL.
6. Immediately run the approved smoke-test matrix.

### Twelve archaeology versions (exact)

```text
20260421
20260511172349
20260512065718
20260512081348
20260512084920
20260512090115
20260512092414
20260512104544
20260512110146
20260512115242
20261053
20261071
```

### Baseline (history-only mark-applied)

```text
20260714010000_production_baseline.sql
```

### Eight Phase 1.11 migrations (exact)

```text
20260714120000_phase_111a_definer_rpc_execute_lockdown.sql
20260714120100_phase_111a_storage_least_privilege_policies.sql
20260714120200_phase_111b_admin_views_security_invoker.sql
20260714120300_phase_111b_log_retention_controls.sql
20260714120400_phase_111b_cascade_fk_audit_comments.sql
20260714130000_phase_111c_revoke_service_role_only_table_grants.sql
20260714130100_phase_111c_strip_dangerous_client_table_privileges.sql
20260714130200_phase_111c_default_privileges_hardening.sql
```

## Explicitly Excluded Scope

- Application deployments
- Application source changes
- Unrelated SQL
- Migration file edits
- New migrations
- Baseline SQL execution against production
- Preview branch work (`hborcp****`, `gfvdic****`)
- Staging / rejected sibling project work (`qpqn****ejrb`)
- Feature development
- Unplanned remediation during the window
- Any use of `--include-all`

## Risk Classification

| Field | Value |
|-------|-------|
| Impact | High |
| Likelihood after controls | Medium (controls incomplete until operational gates pass); Low only after dual-approved backup-only exception + dual approval + dry-run + smoke readiness |
| Primary risks | Wrong-target mutation; baseline replay; privilege regressions / 42501; incomplete recovery without PITR; operator improvisation |
| Mitigations | Model B sequence; identity re-proof; dry-run = 8; no `--include-all`; H02C SQL; smoke matrix; dual approval; change freeze; backup-only recovery exception (when dual-approved) |
| Rollback constraints | Prefer roll-forward privilege fixes; database PITR **not enabled** (infrastructure/cost decision); physical backups exist but are **not** equivalent to PITR; restore is last-resort and separately authorized |
| Accepted limitations | No approved cloud staging soak (local Docker only); first production apply will show larger privilege deltas vs H02A local catalog; no arbitrary point-in-time restore while PITR remains disabled |

### Recovery evidence snapshot (read-only)

| Field | Required Value | Recorded Value |
|-------|----------------|----------------|
| Project | `shalean-platform` | `shalean-platform` |
| Project reference | masked `tchaye****` | `tchaye****xlvfu` |
| PITR enabled | Yes/No | **No** (`pitr_enabled: false`) |
| Evidence source | Exact source | `npx supabase backups list --project-ref tchaye****xlvfu --output json` |
| Evidence captured at | Absolute date/time | 2026-07-14T16:23:00+02:00 (Africa/Johannesburg) |
| Latest recoverable point | Timestamp | Physical backup `1108905187` at `2026-07-14T00:37:50.739Z` (`2026-07-14T02:37:50+02:00`) |
| Recovery window | If available | PENDING (PITR off; physical backup inventory only) |
| Recovery owner | Named person/role | Farai Chitekedza |
| Recovery escalation path | Named method | PENDING |
| Evidence file/ticket | Path or reference | `docs/audits/evidence/h02b-pitr-backup-inspection-2026-07-14/` |

## Backup-Only Recovery Exception

**Exception status:** `PENDING` — engineering and business owners named; Approver 1/2 names, approvals, and timestamps not yet supplied. This section formalizes the exception model; it does **not** authorize H02B execution.

### Decision context

| Field | Value |
|-------|-------|
| PITR status | **Disabled** (`pitr_enabled: false`) |
| Reason | Current production compute is below the minimum required size (Small) for PITR, and Shalean is **not** upgrading compute or purchasing the paid PITR add-on at this time |
| Evidence | `docs/audits/evidence/h02b-pitr-backup-inspection-2026-07-14/` |
| Relationship to physical backups | Daily physical backups are present and completed; they are a controlled safeguard, **not** equivalent to PITR |

### Existing safeguards (prerequisite controls)

- Completed daily physical backups (`walg_enabled: true`; eight `COMPLETED` backups verified on 2026-07-14)
- Verified latest physical backup: ID `1108905187` at `2026-07-14T00:37:50.739Z` (`2026-07-14T02:37:50+02:00` Africa/Johannesburg)
- Controlled maintenance window (required before GO; see maintenance-window plan)
- Repository and migration validation (`npm run db:migrations:validate`; approved SHA / dry-run gates)
- Named recovery authority required before any restore decision
- Smoke testing and rollback decision process required before and during the window

### Accepted limitations

- No arbitrary point-in-time restoration (cannot restore to an arbitrary second)
- Potential loss of changes since the latest usable backup if a catastrophic restore is required
- Backup restoration may have a longer RTO than PITR
- Physical backups must **not** be described or treated as equivalent to PITR

### Exception expiry / review triggers

Re-open or expire this exception and re-evaluate PITR if any of the following occur:

- Production compute upgrade (to Small or larger, making PITR eligible)
- Significant increase in transaction volume
- Major database migration
- Major platform expansion
- Production incident involving data loss or operator error
- Annual infrastructure review

### Exception approval fields

| Role | Name | Decision | Timestamp | Evidence reference |
|------|------|----------|-----------|-------------------|
| Engineering owner | Farai Chitekedza | PENDING | PENDING | PENDING |
| Business owner | Farai Chitekedza | PENDING | PENDING | PENDING |
| Approver 1 | PENDING | PENDING | PENDING | PENDING |
| Approver 2 | PENDING | PENDING | PENDING | PENDING |

**Rules**

- Exception remains **PENDING** until all four roles record an explicit decision (`APPROVED` / `REJECTED`), timestamp, and durable evidence reference.
- Dual approval (Approver 1 and Approver 2) is mandatory; Approver 1 and Approver 2 must be distinct from each other, and the execution operator may not serve as both.
- Naming a person without a written decision does **not** pass the exception.
- Even after this exception is dual-approved, H02B remains **NO-GO** until all remaining operational gates (window, operators, smoke fixtures, final go/no-go) PASS.

## Approvals

| Role | Name | Approval Decision | Timestamp | Evidence |
|------|------|-------------------|-----------|----------|
| Approver 1 | PENDING | PENDING | PENDING | PENDING |
| Approver 2 | PENDING | PENDING | PENDING | PENDING |
| Change owner | Farai Chitekedza | PENDING | PENDING | PENDING |
| Operations/business owner | Farai Chitekedza | PENDING | PENDING | PENDING |

**Rules**

- An approver passes only when name/role, explicit `APPROVED`, timestamp, and evidence are recorded.
- The execution operator may not serve as both Approver 1 and Approver 2.
- Naming a person without a written `APPROVED` decision does not count.

## Assigned Operators

| Responsibility | Assigned Person | Availability Confirmed | Contact Method |
|----------------|-----------------|------------------------|----------------|
| Execution operator | Princess Saidi | PENDING | PENDING |
| Verification operator | Beaulla Chemugarira | PENDING | PENDING |
| Recovery owner | Farai Chitekedza | PENDING | PENDING |
| Communications owner | Farai Chitekedza | PENDING | PENDING |
| Business validation owner | Farai Chitekedza | PENDING | PENDING |

Names above are approved assignments only. Availability confirmation, contact method, and signed acknowledgement remain PENDING.

## Companions

- `docs/runbooks/h02b-production-security-remediation-runbook-2026-07-14.md`
- `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md`
- `docs/runbooks/h02b-maintenance-window-plan-2026-07-14.md`
- `docs/runbooks/h02b-production-smoke-test-matrix-2026-07-14.md`
- `docs/runbooks/h02b-operator-acknowledgement-2026-07-14.md`
- `docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql`
- `docs/audits/sql/h01-5-production-catalog-verification-2026-07-14.sql`

```text
THIS RECORD DOES NOT AUTHORIZE H02B EXECUTION
EXECUTION REQUIRES GO/NO-GO = GO (OR GO PENDING WINDOW WITH ALL OTHER GATES PASS)
```
