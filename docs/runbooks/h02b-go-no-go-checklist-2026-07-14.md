# H02B Production Security Remediation Go/No-Go Checklist

## Document Control

| Field | Value |
|-------|-------|
| Status | **NO-GO — OPERATIONAL PREREQUISITES INCOMPLETE** |
| Owner | Engineering (DB) |
| Target environment | Production only — Supabase `shalean-platform` |
| Production project reference (masked) | `tchaye****xlvfu` |
| Rejected project (must never be linked) | `qpqn****ejrb` (`shalean project`) |
| Approved Git branch | `main` |
| Approved Git commit | `99526d72fca841fdc189eaf33720655a564675b0` |
| Change classification | Controlled migration-history cutover (Model B) + Phase 1.11A–C security/ACL apply |
| Change ID | `PENDING-CHANGE-ID` |
| Maintenance window | PENDING — not scheduled |
| Approver 1 | PENDING |
| Approver 2 | PENDING |
| PITR confirmation | **EXCEPTION REQUIRED** — `pitr_enabled: false`; backup-only exception model formalized, dual approval PENDING |
| Latest physical backup | ID `1108905187` at `2026-07-14T00:37:50.739Z` |
| Backup-only recovery exception | **PENDING** |
| Execution operator | Princess Saidi |
| Verification operator | Beaulla Chemugarira |
| Communications owner | Farai Chitekedza |
| Recovery owner | Farai Chitekedza |
| Review type | Operational prerequisites package (read-only; no production mutation) |
| Package timestamp | 2026-07-14T16:50:00+02:00 (Africa/Johannesburg) |

**Companions**

- `docs/runbooks/h02b-production-security-remediation-runbook-2026-07-14.md`
- `docs/runbooks/h02b-production-change-control-2026-07-14.md`
- `docs/runbooks/h02b-maintenance-window-plan-2026-07-14.md`
- `docs/runbooks/h02b-production-smoke-test-matrix-2026-07-14.md`
- `docs/runbooks/h02b-operator-acknowledgement-2026-07-14.md`
- `docs/audits/evidence/h02b-pitr-backup-inspection-2026-07-14/`
- `docs/audits/h02-program-progress-status-2026-07-14.md`
- `docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql`
- `docs/audits/sql/h01-5-production-catalog-verification-2026-07-14.sql`

```text
THIS CHECKLIST IS AN APPROVAL GATE — NOT AN EXECUTION TRANSCRIPT
DO NOT EXECUTE H02B UNTIL EVERY BLOCKING GATE IS PASS AND THE FINAL DECISION IS GO
EXECUTION HANDOFF NOT CREATED — DECISION IS NO-GO
```

---

## Consolidated Gate Table

| Gate ID | Gate | Status | Owner | Evidence | Blocking? | Required Action |
| ------- | ---- | ------ | ----- | -------- | --------- | --------------- |
| TECH-01 | Repository branch is `main` | PASS | Engineering (DB) | `git branch --show-current` → `main` | Yes | None |
| TECH-02 | Approved SHA unchanged; `HEAD` = `origin/main` | PASS | Engineering (DB) | `git rev-parse HEAD` = `99526d72…` = `origin/main` | Yes | None |
| TECH-03 | No application source changes | PASS | Engineering (DB) | `git diff -- apps/web` empty | Yes | None |
| TECH-04 | No migration SQL changes | PASS | Engineering (DB) | `git diff -- supabase/migrations` empty | Yes | None |
| TECH-05 | Migration validation PASS; nine active files | PASS | Engineering (DB) | `npm run db:migrations:validate` PASS | Yes | None |
| TECH-06 | Production linked identity | PASS | Engineering (DB) | `projects list` linked `shalean-platform` / `tchaye****`; `.temp` agrees; `qpqn****` unlinked | Yes | Re-check before execution |
| TECH-07 | Production data shape | PASS | Engineering (DB) | MCP SELECT 2026-07-14: `auth.users=167`, `public.bookings=432` | Yes | Re-check before execution |
| TECH-08 | Migration history shape | PASS | Engineering (DB) | `migration list --linked`: 12 remote-only archaeology; baseline + 8 Phase 1.11 local-only | Yes | Re-check before execution |
| TECH-09 | Verification SQL packs present | PASS | Engineering (DB) | `docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql`; `h01-5-…sql` | Yes | Attach results at execution |
| REC-01 | Recovery readiness (PITR unavailable by current infrastructure decision) | **EXCEPTION REQUIRED** — overall recovery not PASS | Ops / Recovery | See REC-01A…REC-01F | Yes | Complete pending exception sub-gates; do not treat as recovery PASS |
| REC-01A | PITR disabled and limitation documented | PASS | Ops / Recovery | Change-control Backup-Only Recovery Exception; evidence folder; `pitr_enabled: false` | Yes | Keep docs current if posture changes |
| REC-01B | Latest physical backup verified | PASS | Ops / Recovery | Backup `1108905187` @ `2026-07-14T00:37:50.739Z`; eight COMPLETED; `walg_enabled: true` | Yes | Reconfirm age at window start |
| REC-01C | Recovery owner assigned | PENDING | Ops | Assigned: Farai Chitekedza; availability not confirmed | Yes | Confirm availability |
| REC-01D | Escalation authority assigned | PENDING | Ops | Not recorded | Yes | Name restore escalation path / authority |
| REC-01E | Backup-only recovery exception dual-approved | PENDING | Approvers + owners | Engineering/business owners named (Farai Chitekedza); approvals unsigned | Yes | Engineering + business owners + Approvers 1/2 + timestamps + evidence |
| REC-01F | Accepted RPO/RTO documented | PENDING | Ops / Engineering | Fields present as PENDING in window plan | Yes | Record and dual-approve accepted RPO/RTO |
| REC-02 | Recoverable / backup timestamp recorded | PASS | Ops / Recovery | Physical backup `1108905187` @ `2026-07-14T00:37:50.739Z`; evidence folder | Yes | Keep current before window; not a PITR substitute |
| REC-03 | Recovery owner assigned + available | PENDING | Ops | Assigned: Farai Chitekedza; availability not confirmed | Yes | Confirm availability |
| REC-04 | Recovery escalation method named | PENDING | Ops | Not recorded | Yes | Name escalation path |
| REC-05 | Application rollback path known | PENDING | Engineering / Ops | Acknowledged preference for roll-forward only; no signed path | Yes | Record explicit app rollback / no-deploy confirmation |
| REC-06 | Database recovery decision authority | PENDING | Ops / Engineering lead | Recovery owner Farai Chitekedza assigned; formal restore-authority acceptance PENDING | Yes | Confirm authority to authorize restore |
| APP-01 | Approver 1 | PENDING | Engineering lead | Unsigned | Yes | Name + `APPROVED` + timestamp + evidence |
| APP-02 | Approver 2 | PENDING | Second approver | Unsigned | Yes | Distinct from execution operator |
| APP-03 | Operations/business approval | PENDING | Farai Chitekedza | Named; unsigned | Yes | Notify + approve |
| APP-04 | Change owner | PENDING | Farai Chitekedza | Named; unsigned accept | Yes | Accept |
| WIN-01 | Maintenance window date/time | PENDING | Ops | Not scheduled | Yes | Supply date/start/end |
| WIN-02 | Timezone Africa/Johannesburg | PENDING | Ops | Timezone known; window times pending | Yes | Bind window to timezone |
| WIN-03 | Change freeze confirmed | PENDING | Ops | Not confirmed | Yes | Confirm freeze bounds |
| WIN-04 | Business/operations notification | PENDING | Farai Chitekedza | Not sent/recorded | Yes | Notify stakeholders |
| WIN-05 | Operator availability for window | PENDING | Ops | Operators assigned; availability for window not confirmed | Yes | Confirm attendance |
| WIN-06 | No active production incident | PENDING | Ops | Not attested | Yes | Attest at T-30 |
| OPS-01 | Execution operator | PASS | Engineering lead | Princess Saidi | Yes | None |
| OPS-02 | Verification operator | PASS | Engineering lead | Beaulla Chemugarira (distinct from execution) | Yes | None |
| OPS-03 | Recovery owner | PASS | Ops | Farai Chitekedza | Yes | None |
| OPS-04 | Communications owner | PASS | Ops | Farai Chitekedza | Yes | None |
| OPS-05 | Business validation owner | PASS | Product/ops | Farai Chitekedza | Yes | None |
| OPS-06 | Operator acknowledgement | PENDING | All assigned operators | Operators named; acknowledgement Status/Timestamp PENDING | Yes | Collect signed acknowledgements |
| SMK-01 | Smoke owners assigned | PENDING | Engineering + product/ops | All ST owners PENDING | Yes | Assign ST-01…ST-16 owners |
| SMK-02 | Accounts/fixtures ready | PENDING | Engineering + product/ops | All fixtures PENDING | Yes | Identify canary accounts/objects (no secrets in docs) |
| SMK-03 | Non-destructive procedures approved | PENDING | Approvers | ST-05 blocked until write approved or alternative accepted | Yes | Approve procedures / ST-05 alternative |
| SMK-04 | Evidence capture ready | PENDING | Beaulla Chemugarira | Format specified; readiness unconfirmed | Yes | Confirm capture method |
| SMK-05 | Stop conditions approved | PENDING | Approvers + operators | Drafted in matrix; unsigned | Yes | Explicit stop-condition acknowledgement |

### Gate rollup

| Category | Passed | Pending | Failed / Exception | Overall |
| -------- | -----: | ------: | -----------------: | ------- |
| Technical | 9 | 0 | 0 | PASS |
| Recovery | 2 | 8 | 1 (REC-01 EXCEPTION REQUIRED) | EXCEPTION / INCOMPLETE — not PASS |
| Approval | 0 | 4 | 0 | PENDING |
| Window | 0 | 6 | 0 | PENDING |
| Execution team | 5 | 1 | 0 | PENDING (OPS-06 acknowledgements) |
| Smoke | 0 | 5 | 0 | PENDING |
| **Total** | **16** | **24** | **1** | **NO-GO** |

Operational readiness (mandatory top-level gates PASS / total, counting REC-01 as not PASS until REC-01C…F complete): **16 / 41 ≈ 39%** (TECH 9 + REC-01A/B/REC-02 = 11 evidence PASSes + OPS-01…05 assignment PASSes; REC-01 parent and remaining human gates incomplete).

**Recovery note:** REC-01A and REC-01B may PASS from current evidence. REC-01C through REC-01F remain PENDING. Recovery overall must **not** be marked PASS until the dual-approved exception and remaining recovery controls are complete.

---

## Technical reconfirmation notes (2026-07-14 operational package)

- Branch `main`; SHA `99526d72fca841fdc189eaf33720655a564675b0`; `HEAD` = `origin/main`.
- Dirty/untracked files limited to approved H01/H02 documentation, evidence, plans, runbooks, SQL packs, and risk-register update.
- Active migrations: nine files (baseline + eight Phase 1.11).
- Linked identity: production; rejected sibling and previews not linked.
- Migration history unchanged vs H01/H01.5 trusted shape.

Approved eight Phase 1.11 files (exact):

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

---

## Final Go/No-Go Decision

### Decision table

| Field | Value |
|-------|-------|
| Decision | **NO-GO — OPERATIONAL PREREQUISITES INCOMPLETE** |
| Date/time | 2026-07-14T16:50:00+02:00 (Africa/Johannesburg) |
| Technical readiness | **COMPLETE (PASS)** |
| PITR readiness | **EXCEPTION REQUIRED** — unavailable by current infrastructure decision (`pitr_enabled: false`); backup-only exception PENDING dual approval |
| Recovery sub-gates | REC-01A / REC-01B **PASS**; REC-01C…REC-01F **PENDING**; recovery overall **not PASS** |
| Approval readiness | **PENDING** |
| Maintenance-window readiness | **PENDING** |
| Operator readiness | **PARTIAL** — OPS-01…05 assigned; OPS-06 acknowledgements PENDING |
| Smoke-test readiness | **PENDING** |
| Next authorized action | Complete backup-only recovery exception dual approval (REC-01E) + escalation + accepted RPO/RTO; confirm operator availability/acknowledgements; then complete human approvals, window, smoke fixtures |

### Why not GO / GO PENDING WINDOW

- GO requires every blocking gate PASS — not met.
- GO PENDING MAINTENANCE WINDOW requires technical + recovery + approvals + owners + smoke all PASS with only future window start remaining — not met (REC-01 EXCEPTION REQUIRED with REC-01C…F PENDING; approvals, window, acknowledgements, and smoke still PENDING).
- Physical backups are **not** equivalent to PITR and do not alone clear REC-01.

---

## Hard Stop Conditions

Stop immediately (do not repair, do not push) if any of the following are true:

- Wrong project identity or identity ambiguity across `.temp` files
- Rejected project `qpqn****ejrb` is linked or used
- Branch or commit mismatch vs approved `main` / SHA
- Migration validation failure
- Unexpected remote migration version
- Dry-run lists baseline SQL (`20260714010000_production_baseline.sql`)
- Dry-run lists anything other than the eight approved Phase 1.11 migrations
- Linked project changes during the window
- PITR remains disabled and a dual-approved backup-only recovery exception is not yet complete (REC-01E PENDING)
- One approver unavailable
- CLI output differs materially from rehearsal **without** an approved updated model
- Verification SQL unavailable
- Smoke-test owner unavailable
- Any command requires `--include-all`
- Unexpected prompt or destructive action appears
- Production health is degraded before deployment
- Remote customer data shape is empty/implausible vs known production
- Out-of-order A/B/C partial application via temporary `repair --status applied` is proposed

---

## Prohibited Actions

- Baseline SQL execution against production
- `--include-all` under any circumstance for this change
- Unplanned migration SQL edits / schema fixes / manual DDL
- Ad hoc privilege changes outside the approved migrations
- Unrelated production work in the same window
- Improvising beyond the H02B runbook
- Continuing after a failed gate
- Using rejected project `qpqn****ejrb`
- Treating local Docker rehearsal as cloud staging soak
- Beginning H02B while Decision ≠ GO
- Creating an execution handoff while mandatory fields remain PENDING
