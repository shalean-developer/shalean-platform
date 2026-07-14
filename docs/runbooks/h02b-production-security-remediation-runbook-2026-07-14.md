# H02B — Production Security Remediation Runbook

**Date:** 2026-07-14  
**Phase package prepared by:** H02A  
**Status:** PACKAGE READY — **DO NOT EXECUTE** until Go/No-Go = GO  
**Model:** Model B — Formal Cutover With Selected Remote Status Repair  
**Verified commit:** `99526d72fca841fdc189eaf33720655a564675b0` on branch **`main`**  
**Companion evidence:**  
- `docs/plans/h02a-controlled-security-remediation-rehearsal-plan-2026-07-14.md`  
- `docs/audits/h02a-non-production-rehearsal-verification-2026-07-14.md`  
- `docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql`  
- `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md`  
- `docs/audits/h02-program-progress-status-2026-07-14.md`

```text
H02B-ONLY COMMANDS BELOW
DO NOT EXECUTE DURING H01 / H01.5 / H02A / DOCUMENTATION AUDITS
PRODUCTION APPROVAL + GO/NO-GO CHECKLIST REQUIRED
```

Every command below requires: confirmed production identity (`tchaye****xlvfu` / `shalean-platform` / `eu-west-3`), consistent `.temp` link metadata, PITR/backup recorded, dual approval, maintenance window, H02A rehearsal accepted, and **Go/No-Go checklist = GO**.

**Local rehearsal is not cloud staging soak.** No approved cloud staging clone exists. Production remains **pre–Phase 1.11** until H02B succeeds and H02C verifies.

**Application smoke coverage remains incomplete** until smoke owners and canary fixtures are assigned on the Go/No-Go checklist.

---

## Absolute prohibitions

- Never execute `20260714010000_production_baseline.sql` against production (baseline is marked applied **without SQL**)  
- Never `supabase db reset` on production  
- **Never use `--include-all`** for any H02B command (including `db push`) — it is unsafe for this change  
- Never hand-edit `supabase_migrations.schema_migrations`  
- Never restore `migrations-legacy` into active `migrations/`  
- Never use rejected project `qpqn****ejrb` (`shalean project`) as staging or production  
- Prefer roll-forward privilege fixes over rewriting Phase 1.11 files  
- Never proceed if `.temp/project-ref`, `linked-project.json`, and pooler identity disagree  
- Never treat an empty/implausible customer data shape as production without identity re-proof

---

## Command package

### 01 — Production identity confirmation

| Field | Value |
|-------|-------|
| Sequence | 01 |
| Command | `Get-Content supabase/.temp/project-ref` / MCP `get_project` / dashboard cross-check |
| Environment | local read + remote inspection |
| Expected output | Ref `tchaye****xlvfu`, name `shalean-platform`, region `eu-west-3`, `ACTIVE_HEALTHY` |
| Expected metadata state | unchanged |
| Expected catalog state | unchanged |
| Verification | Matches H01/H01.5 identity; `.temp/project-ref` **equals** `linked-project.json.ref`; both prefix `tchaye****`; pooler region `eu-west-3`; rejected `qpqn****` excluded |
| Stop condition | Any mismatch, uncertain target, or empty/implausible production data vs known live posture |
| Recovery | Abort; do not proceed; repair link under separate ops approval — do not invent a project |
| Required approver | Engineering (DB) |

```text
H02B-ONLY — PRODUCTION APPROVAL REQUIRED
```

### 02 — Backup / PITR confirmation

| Field | Value |
|-------|-------|
| Sequence | 02 |
| Command | Dashboard/ops checklist — record PITR enabled + recovery point timestamp / backup ID |
| Environment | production ops |
| Expected output | Written recovery point in ticket |
| Expected metadata/catalog | unchanged |
| Verification | Ops sign-off attached |
| Stop condition | PITR unavailable or no recorded point |
| Recovery | Abort until backup confirmed |
| Required approver | Ops |

```text
H02B-ONLY — PRODUCTION APPROVAL REQUIRED
```

### 03 — Preflight catalog capture

| Field | Value |
|-------|-------|
| Sequence | 03 |
| Command | Run SELECT-only pack: `docs/audits/sql/h01-5-production-catalog-verification-2026-07-14.sql` via approved read-only path |
| Environment | production read-only |
| Expected output | Pre-1.11 privilege posture (matches H01.5 FAIL shape) |
| Expected metadata | unchanged |
| Expected catalog | still missing Phase 1.11 effects |
| Verification | Attach results to ticket |
| Stop condition | Unexpected structural absence of critical tables; unexplained objects blocking 1.11 |
| Recovery | Abort to investigation |
| Required approver | Engineering (DB) |

```text
H02B-ONLY — PRODUCTION APPROVAL REQUIRED
```

### 04 — Preflight migration list

| Field | Value |
|-------|-------|
| Sequence | 04 |
| Command | `npx supabase migration list --linked` |
| Environment | production metadata read |
| Expected output | 12 remote-only archaeology + 9 local-only active (disjoint) — same shape as H01/H02A |
| Expected metadata | as listed |
| Expected catalog | unchanged |
| Verification | Diff against H01 version set |
| Stop condition | Unexpected new remote versions; surprise overlap; archaeology set ≠ exact 12 listed in Model B; any identity doubt |
| Recovery | Update ticket; re-plan; do not repair yet. If history already differs from H01 shape, **stop** and obtain a dual-approved updated Model B preflight — do not improvise |
| Required approver | Engineering (DB) |

```text
H02B-ONLY — PRODUCTION APPROVAL REQUIRED
```

### 05 — Metadata repair: revert 12 archaeology versions

| Field | Value |
|-------|-------|
| Sequence | 05 |
| Command | see exact block below |
| Environment | production metadata mutation |
| Expected output | `Repaired migration history: […] => reverted` |
| Expected metadata state | 12 archaeology no longer applied; 9 active still local-only |
| Expected catalog state | unchanged (metadata only) |
| Verification | `npx supabase migration list --linked` — archaeology absent from remote applied |
| Stop condition | Unexpected CLI error; list shape differs from rehearsal |
| Recovery | Re-`repair --status applied` those versions from preflight list if no DDL yet |
| Required approver | Engineering lead |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

```bash
npx supabase migration repair --status reverted --linked --yes \
  20260421 \
  20260511172349 \
  20260512065718 \
  20260512081348 \
  20260512084920 \
  20260512090115 \
  20260512092414 \
  20260512104544 \
  20260512110146 \
  20260512115242 \
  20261053 \
  20261071
```

### 06 — Baseline applied-marker (no SQL)

| Field | Value |
|-------|-------|
| Sequence | 06 |
| Command | `npx supabase migration repair --status applied --linked --yes 20260714010000` |
| Environment | production metadata mutation |
| Expected output | `Repaired migration history: [20260714010000] => applied` |
| Expected metadata state | Baseline remote=local applied; Phase 1.11 still local-only |
| Expected catalog state | unchanged |
| Verification | `migration list --linked` shows `20260714010000` on both sides |
| Stop condition | Repair fails; baseline still pending |
| Recovery | Do not push; investigate; re-mark applied if needed |
| Required approver | Engineering lead |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 07 — Mid-gate dry-run (must exclude baseline)

| Field | Value |
|-------|-------|
| Sequence | 07 |
| Command | `npx supabase db push --linked --dry-run` |
| Environment | production (no apply) |
| Expected output | Would push **exactly** these eight files (baseline **absent**): |
| | `20260714120000_phase_111a_definer_rpc_execute_lockdown.sql` |
| | `20260714120100_phase_111a_storage_least_privilege_policies.sql` |
| | `20260714120200_phase_111b_admin_views_security_invoker.sql` |
| | `20260714120300_phase_111b_log_retention_controls.sql` |
| | `20260714120400_phase_111b_cascade_fk_audit_comments.sql` |
| | `20260714130000_phase_111c_revoke_service_role_only_table_grants.sql` |
| | `20260714130100_phase_111c_strip_dangerous_client_table_privileges.sql` |
| | `20260714130200_phase_111c_default_privileges_hardening.sql` |
| Expected metadata | unchanged by dry-run |
| Expected catalog | unchanged |
| Verification | Manual count = 8; no `production_baseline` |
| Stop condition | Baseline listed; remote-only conflict error; any extra/missing file |
| Recovery | Abort push; repair metadata to match Model B; **never** use `--include-all` |
| Required approver | Engineering lead |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 08 — Phase 1.11A–C apply (single coordinated push)

| Field | Value |
|-------|-------|
| Sequence | 08 |
| Command | `npx supabase db push --linked --yes` |
| Environment | production schema/ACL mutation |
| Expected output | Applying each of the eight files in order; Finished successfully |
| Expected metadata state | All nine active versions aligned |
| Expected catalog state | Phase 1.11A–C effects present |
| Verification | Immediate steps 09–12 |
| Stop condition | Any migration apply error; unexpected long lock / timeout |
| Recovery | Stop; note last applied version; roll-forward or PITR per incident plan — do not rewrite 1.11 files |
| Required approver | Engineering lead + ops/product |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

**Note (H02A rehearsal):** CLI does not safely support out-of-order A-only then B then C via temporary `repair --status applied` without `--include-all`. Treat phases as logical verification groups after one push.

### 09 — Phase 1.11A verification

| Field | Value |
|-------|-------|
| Sequence | 09 |
| Command | SELECT sections for storage policies + DEFINER grants from `h02a-post-remediation-verification-2026-07-14.sql` |
| Environment | production read-only verify |
| Expected catalog | 4 `phase111a_deny_*` policies; privileged DEFINER anon_exec false except marketing pair; anon DEFINER count = 2 |
| Stop condition | Policy/DEFINER criteria fail |
| Recovery | Incident; prefer forward fix; consider PITR if catastrophic |
| Required approver | Engineering (DB) |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 10 — Phase 1.11B verification

| Field | Value |
|-------|-------|
| Sequence | 10 |
| Command | Retention + admin view + FK comment sections of verify SQL |
| Environment | production read-only |
| Expected catalog | `data_retention_settings` exists; prune 2-arg functions exist; 12 admin views invoker=true; AUDIT comments present |
| Stop condition | Missing retention objects / invoker false |
| Recovery | Forward fix or PITR |
| Required approver | Engineering (DB) |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 11 — Phase 1.11C verification

| Field | Value |
|-------|-------|
| Sequence | 11 |
| Command | Dangerous privs, sequence, default ACL, schema CREATE sections |
| Environment | production read-only |
| Expected catalog | Dangerous counts 0; seq client false; default ACL client rows 0; schema CREATE false |
| Stop condition | Any CRITICAL privilege criterion fails |
| Recovery | Forward GRANT/REVOKE migration; PITR if needed |
| Required approver | Engineering (DB) |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 12 — Final migration list

| Field | Value |
|-------|-------|
| Sequence | 12 |
| Command | `npx supabase migration list --linked` |
| Environment | production metadata read |
| Expected output | All nine active versions present on local and remote; archaeology not applied |
| Stop condition | Drift vs expected Model B end state |
| Recovery | Metadata-only re-repair if DDL succeeded and history wrong; never re-run baseline |
| Required approver | Engineering (DB) |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 13 — Final catalog verification

| Field | Value |
|-------|-------|
| Sequence | 13 |
| Command | Full `docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql` (+ optional phase-1-11a-b / 1.11c packs) |
| Environment | production read-only |
| Expected catalog | All PASS criteria in SQL footer |
| Stop condition | Any FAIL criterion |
| Recovery | Do not close ticket; remediate |
| Required approver | Engineering (DB) |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 14 — Application smoke tests

| Field | Value |
|-------|-------|
| Sequence | 14 |
| Command | Approved checklist (no real charges / use canary accounts) |
| Environment | production / app |
| Expected | customer auth; booking read; pricing; payment prepare (test); admin dashboard; cleaner login/jobs/earnings; payout admin (safe); storage upload/read via service paths; cron via service_role; notifications test-safe; server service_role ops |
| Stop condition | Critical workflow broken (42501 storms, admin lockout, booking create fail) |
| Recovery | Forward privilege restore migration; escalate PITR if necessary |
| Required approver | Engineering + product/ops |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 15 — Monitoring

| Field | Value |
|-------|-------|
| Sequence | 15 |
| Command | Watch error rates, auth failures, API 5xx/42501 for ≥30–60 minutes |
| Environment | production observability |
| Expected | No sustained privilege-related error spike |
| Stop condition | Incident threshold breached |
| Recovery | Incident response |
| Required approver | On-call |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

### 16 — Closure evidence

| Field | Value |
|-------|-------|
| Sequence | 16 |
| Command | Attach final migration list, verify SQL outputs, smoke results, PITR note, approver names |
| Environment | ticket |
| Expected | Complete closure pack |
| Stop condition | Missing evidence |
| Recovery | Keep ticket open |
| Required approver | Engineering lead |

```text
H02B-ONLY � PRODUCTION APPROVAL REQUIRED
```

---

## Stop conditions (block or abort)

- No successful non-production rehearsal accepted  
- Production project identity uncertain  
- PITR/backup unavailable  
- Migration repair output differs from rehearsal  
- Dry-run includes baseline or ≠ eight Phase 1.11 files  
- Remote-only versions still blocking push  
- Any migration not transaction-safe without recovery (not the case for 1.11 set as reviewed)  
- Privileged workflows fail after hardening  
- Catalog verification fails  
- Target history model ambiguous  
- Dual approvals missing  
- Monitoring/incident response unavailable  
- Temptation to use `--include-all` for any reason (absolute prohibition)
- Linked `.temp` identity files disagree
- Customer data shape implausible for production (identity not proven)

---

## H02B decision gate

```text
FROM H02A: REHEARSAL COMPLETE WITH DOCUMENTED LIMITATIONS
FROM PROGRESS AUDIT: GO/NO-GO CHECKLIST REQUIRED
EXECUTE ONLY AFTER CHECKLIST = GO (EVERY MANDATORY GATE)
```

Do not begin production repair/push from this runbook while the Go/No-Go checklist remains **NO-GO**.