# H02A — Controlled Security Remediation Planning and Non-Production Rehearsal

**Date:** 2026-07-14  
**Phase:** H02A (planning, local rehearsal, verification — **not** production execution)  
**Status:** COMPLETE — APPROVED (local Docker rehearsal; documented limitations remain H02B prerequisites)  
**Audited commit:** `99526d72fca841fdc189eaf33720655a564675b0`  
**Companions:**
- `docs/audits/h02a-non-production-rehearsal-verification-2026-07-14.md`
- `docs/runbooks/h02b-production-security-remediation-runbook-2026-07-14.md`
- `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md`
- `docs/audits/h02-program-progress-status-2026-07-14.md`
- `docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql`
- Predecessors: H01 audit/plan, H01.5 catalog FAIL

**Clarifications (progress audit 2026-07-14):**

- H02A mutations were **local Docker only** — not production and not cloud staging soak.
- Production remains **pre–Phase 1.11** until H02B succeeds.
- Application smoke coverage remains **incomplete** (seeded auth / booking write / Paystack / cleaner paths not fully exercised).
- H02B mutating commands are **H02B-only** and require Go/No-Go = GO.
- `--include-all` is **prohibited**.
- Baseline SQL must **never** run on populated production; mark applied without SQL.
- Approved execution branch is **`main`** at the approved SHA (do not treat other branch tip equality as a substitute without gate re-check).
- Rejected project `qpqn****ejrb` must never be used as staging or production.
---

## 1. Executive summary

H01.5 confirmed production is still at the **pre–Phase 1.11 privilege posture** with disjoint migration metadata. H02A rehearsed the exact cutover procedure required to apply governed Phase 1.11A–C security migrations **without executing the production baseline DDL**.

**Rehearsal verdict (local Docker only):**

| Finding | Result |
|---------|--------|
| Model A (preserve remote-only archaeology + mark baseline) | **FAIL for `db push`** — CLI refuses while remote-only versions lack local files |
| Model B (revert 12 archaeology + mark baseline applied + push 1.11) | **PASS** — dry-run lists exactly eight Phase 1.11 files; baseline excluded |
| Baseline treatment | **MARK APPLIED WITHOUT EXECUTING SQL** — proven |
| Out-of-order staged A→B→C via temporary `repair --status applied` | **NOT CLI-compatible** without `--include-all` (unsafe if baseline pending) |
| Production package | Exact Model B runbook ready for **approval with prerequisites** |

```text
RECOMMENDED TARGET MODEL: Model B — Formal Cutover With Selected Remote Status Repair
H02A: COMPLETE — APPROVED (with documented limitations)
H02B: GO/NO-GO CHECKLIST REQUIRED — DO NOT EXECUTE UNTIL GO
```

---

## 2. Scope

**In scope**

- Documentation and migration review (H02A-01)
- Active migration classification matrix (H02A-02)
- Remote-only history mapping (H02A-03)
- Candidate metadata models + recommendation after rehearsal (H02A-04)
- Idempotency / failure risk review (H02A-05)
- Non-production environment verification (H02A-06)
- Local Docker metadata + Phase 1.11 apply rehearsal (H02A-07–13)
- Production command package (H02A-14) and stop conditions (H02A-15)

**Out of scope**

- H02B production execution
- Any `--linked` mutation against production
- Creating new cloud projects
- Rewriting historical migrations
- Committing / pushing (unless separately instructed)

---

## 3. Safety boundaries

### Production (locked for H02A)

Prohibited against production: `migration repair`, `db push`, `migration up`, `db reset`, baseline SQL, Phase 1.11 SQL, any DDL/DCL/DML, edits to `schema_migrations`, relink, secret/config changes.

Production access used for identity confirmation only (prior H01.5 + read-only migration list reconfirmation).

### Non-production mutations

All rehearsal mutations used **`--local` only** against Docker stack `supabase_db_shalean-platform`.

```text
APPROVED NON-PRODUCTION REHEARSAL TARGET
Environment: Local Supabase Docker
Identity: 127.0.0.1:54322 / container supabase_db_shalean-platform
Not production: linked cloud ref tchaye****xlvfu never mutated
Customer data: 0 auth.users, 0 bookings
Recovery: supabase db reset / re-repair metadata
```

### Rejected candidates

| Candidate | Ref (masked) | Decision |
|-----------|--------------|----------|
| `shalean-platform` | `tchaye****xlvfu` | **PRODUCTION** — no mutation |
| `shalean project` | `qpqn****ejrb` | **REJECTED** — 26 auth users; 26 public tables; different migration history; not approved for corrective testing |
| New cloud project | n/a | **Not created** (H02A forbids auto-provision) |

---

## 4. Prior findings (verified)

| Claim | Verified in H02A |
|-------|:----------------:|
| Branch `main` @ `99526d72…` = `origin/main` | Yes |
| Active migrations validate (9 files) | Yes — PASS |
| Legacy archive 427 SQL | Yes (prior inventory retained) |
| Remote 12 archaeology versions; disjoint from active 9 | Yes — live list reconfirmed |
| H01.5 FAIL — Phase 1.11 effects absent on production | Yes — documentation + strategy retained |
| Do not execute baseline on populated DB | Yes — dry-run proves push would apply baseline if unmarked |

---

## 5. Production project identity

| Field | Value |
|-------|-------|
| Name | `shalean-platform` |
| Ref (masked) | `tchaye****xlvfu` |
| Region | `eu-west-3` |
| Status | `ACTIVE_HEALTHY` |
| Link evidence | `supabase/.temp/project-ref` |
| Role in H02A | Read-only identity / prior catalog evidence only |

---

## 6. Rehearsal project identity

| Field | Value |
|-------|-------|
| Classification | **APPROVED NON-PRODUCTION REHEARSAL TARGET** |
| Kind | Local Docker Supabase |
| DB host | `127.0.0.1:54322` (Docker `172.18.0.2`) |
| Linked cloud mutated? | **No** |
| Customer data | None observed |
| Backup/reset | `npx supabase db reset` (destructive local rebuild) |
| Limitation | Already had post-1.11 schema before simulation; Phase 1.11 push proved **idempotent re-apply** + metadata isolation, not first-time hardening on a virgin privilege catalog |

---

## 7. Active migration matrix

| Version | Filename | Category | Intended production effect | Present in production | Present in remote metadata | Re-execution safety | Required H02 treatment |
| ------- | -------- | -------- | -------------------------- | --------------------- | -------------------------- | ------------------- | ---------------------- |
| 20260714010000 | `…_production_baseline.sql` | BASELINE_CUTOVER_MARKER | Embodies baseline-era catalog; **must not run on prod** | Structure ≈ yes (H01.5); privileges pre-1.11 | No | **Unsafe** on populated DB | `MARK_APPLIED_WITHOUT_SQL` |
| 20260714120000 | `…_phase_111a_definer_rpc_execute_lockdown.sql` | PHASE_111A_SECURITY | Lock DEFINER EXECUTE | No | No | Idempotent REVOKE/GRANT | `EXECUTE_THROUGH_MIGRATION_TOOL` |
| 20260714120100 | `…_phase_111a_storage_least_privilege_policies.sql` | PHASE_111A_SECURITY | Ensure buckets + 4 deny policies | Buckets yes; policies no | No | `IF EXISTS` / `ON CONFLICT` | `EXECUTE_THROUGH_MIGRATION_TOOL` |
| 20260714120200 | `…_phase_111b_admin_views_security_invoker.sql` | PHASE_111B_INTEGRITY | Admin views invoker + client revoke | No (invoker false) | No | ALTER VIEW + REVOKE/GRANT | `EXECUTE_THROUGH_MIGRATION_TOOL` |
| 20260714120300 | `…_phase_111b_log_retention_controls.sql` | PHASE_111B_INTEGRITY | Retention table + prune RPCs | No table | No | `IF NOT EXISTS` / `CREATE OR REPLACE` | `EXECUTE_THROUGH_MIGRATION_TOOL` |
| 20260714120400 | `…_phase_111b_cascade_fk_audit_comments.sql` | PHASE_111B_INTEGRITY | COMMENT only on CASCADE FKs | Comments absent | No | COMMENT replace-safe | `EXECUTE_THROUGH_MIGRATION_TOOL` |
| 20260714130000 | `…_phase_111c_revoke_service_role_only_table_grants.sql` | PHASE_111C_PRIVILEGE | Revoke client grants on service-only tables | No | No | Idempotent REVOKE | `EXECUTE_THROUGH_MIGRATION_TOOL` |
| 20260714130100 | `…_phase_111c_strip_dangerous_client_table_privileges.sql` | PHASE_111C_PRIVILEGE | Strip TRUNCATE/TRIGGER/REFERENCES/MAINTAIN; seq; WhatsApp helpers | No | No | Idempotent REVOKE | `EXECUTE_THROUGH_MIGRATION_TOOL` |
| 20260714130200 | `…_phase_111c_default_privileges_hardening.sql` | PHASE_111C_PRIVILEGE | Revoke postgres→anon/auth defaults | No | No | Idempotent ALTER DEFAULT PRIVILEGES | `EXECUTE_THROUGH_MIGRATION_TOOL` |

**Git introduction:** baseline `b755e7f9`; 1.11A–B `1b945a18`; 1.11C `a7bb5603` (tightened `ef1e814a` / `8f78f12e`).

---

## 8. Remote-only history mapping

| Remote version | Legacy file match | Git evidence | Represented by baseline | Proposed status | Risk | Notes |
| -------------- | ----------------- | ------------ | ----------------------- | --------------- | ---- | ----- |
| 20260421 | Multiple `20260421*` | Archive | Yes (collapsed) | `reverted` | Low | CLI cannot `db push` while retained |
| 20260511172349 | `…_remote_history_placeholder.sql` (+ semantic `20260933_*`) | Archive | Yes | `reverted` | Low | Dual-history archaeology |
| 20260512065718 | placeholder (+ `20260935_*`) | Archive | Yes | `reverted` | Low | Same |
| 20260512081348 | placeholder (+ `20260936_*`) | Archive | Yes | `reverted` | Low | Same |
| 20260512084920 | placeholder (+ `20260937_*`) | Archive | Yes | `reverted` | Low | Same |
| 20260512090115 | placeholder (+ `20260938_*`) | Archive | Yes | `reverted` | Low | Same |
| 20260512092414 | placeholder (+ `20260939_*`) | Archive | Yes | `reverted` | Low | Same |
| 20260512104544 | placeholder (+ `20260940_*`) | Archive | Yes | `reverted` | Low | Same |
| 20260512110146 | placeholder (+ `20260941_*`) | Archive | Yes | `reverted` | Low | Same |
| 20260512115242 | placeholder (+ `20260942_*`) | Archive | Yes | `reverted` | Low | Same |
| 20261053 | `20261053_location_gsc_period_trends.sql` | Archive | Yes (assumed) | `reverted` | Low–Med | Stamp after baseline numeral; must not block cutover |
| 20261071 | `20261071_booking_fulfillment_mode_and_demand.sql` | Archive | Yes (assumed) | `reverted` | Low–Med | Same |

**Default overturned by rehearsal:** preserving remote-only rows **blocks** `db push`. Documented provenance remains in Git archive + this plan; CLI history after repair retains audit via ticket attachments / pre-change `migration list` captures — not by keeping remote-only applied rows.

---

## 9. Candidate metadata models

### Model A — Preserve Historical Remote Records Plus Cutover Marker

- Keep all 12 remote-only as applied
- Mark `20260714010000` applied without SQL
- Apply Phase 1.11A–C

| Dimension | Assessment |
|-----------|------------|
| Resulting list | 12 archaeology + baseline + 8 Phase 1.11 |
| CLI compatibility | **FAIL** — `db push` errors: remote versions not in local directory; CLI instructs revert |
| Advantages | Keeps remote stamps visible indefinitely |
| Disadvantages | Cannot use standard push; requires custom apply path |
| Auditability | High for remote stamps; low for operable tooling |
| Risk | High operational (operators invent unsafe workarounds) |
| Reversibility | Easy (no archaeology repair) |
| Future `db push` | Blocked without `--include-all` / repair |
| Fresh local replay | Unaffected (local uses file chain) |
| Production recovery | Poor — tooling unusable |

### Model B — Formal Cutover With Selected Remote Status Repair (RECOMMENDED)

- Mark all 12 archaeology `reverted`
- Mark baseline `applied` (no SQL)
- `db push` applies exactly eight Phase 1.11 migrations

| Dimension | Assessment |
|-----------|------------|
| Resulting list | Baseline + 8 Phase 1.11 (aligned local/remote) |
| CLI compatibility | **PASS** (rehearsed) |
| Advantages | Restores governed Git as operational history |
| Disadvantages | Remote-only stamps leave the applied set (archived in docs/Git) |
| Auditability | High if pre-repair list attached to ticket |
| Risk | Medium if gated; Critical if baseline pending during push |
| Reversibility | Metadata re-repair possible; DDL needs roll-forward/PITR |
| Future `db push` | Normal |
| Fresh local replay | Matches remote after cutover |
| Production recovery | Standard CLI path |

---

## 10. Recommended target model

```text
MODEL B — Formal Cutover With Selected Remote Status Repair
```

Proven ordering (rehearsal evidence either order of repair steps works if dry-run passes; **recommended production order**):

1. Capture preflight `migration list --linked` + catalog SELECTs  
2. `migration repair --status reverted --linked` for all **12** archaeology versions  
3. `migration repair --status applied --linked 20260714010000`  
4. `db push --linked --dry-run` → **must list exactly eight Phase 1.11 files**  
5. `db push --linked --yes` (single coordinated apply of A→C)  
6. Catalog + application verification  

**Do not** use temporary out-of-order `repair --status applied` to stage A/B/C — CLI requires `--include-all`, which is **prohibited** for this change (unsafe if baseline were pending).

---

## 11. Migration dependency order

1. Baseline objects assumed present on production (do not recreate).  
2. Phase 1.11A DEFINER lockdown → storage policies.  
3. Phase 1.11B views → retention → FK comments.  
4. Phase 1.11C service-only revoke → dangerous strip → default privileges.  
5. Dependencies: 1.11B retention assumes public schema; 1.11C assumes tables from baseline; storage assumes `storage.objects` RLS.

---

## 12. Migration idempotency review

| Migration | Idempotent | Transaction-safe | Lock risk | Partial failure risk | Expected runtime | Stop condition |
| --------- | ---------- | ---------------- | --------- | -------------------- | ---------------- | -------------- |
| 20260714120000 | High (REVOKE/GRANT loops) | BEGIN/COMMIT | Low | Medium (mid-loop) | Seconds–low minutes | Any non-zero apply error; anon DEFINER count not → 2 |
| 20260714120100 | High (`ON CONFLICT`, `DROP POLICY IF EXISTS`) | Yes | Low | Low | Seconds | Deny policy count ≠ 4 |
| 20260714120200 | High (ALTER VIEW + REVOKE) | Yes | Low | Low | Seconds | Any admin view `security_invoker=false` |
| 20260714120300 | High (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`) | Yes | Low | Low | Seconds | Retention table/functions missing |
| 20260714120400 | High (COMMENT) | Yes | Negligible | Negligible | Seconds | Apply error |
| 20260714130000 | High (REVOKE loop) | Yes | Low–Med (ACL) | Medium | Seconds–low minutes | Service-only tables still grant client SELECT |
| 20260714130100 | High | Yes | Low–Med | Low | Seconds | Dangerous priv counts ≠ 0 |
| 20260714130200 | High | Yes | Low | Low | Seconds | Default ACL still grants anon/auth |
| 20260714010000 | N/A — never execute | N/A | Catastrophic | N/A | N/A | **Any attempt to apply on prod** |

Rehearsal re-apply produced only `NOTICE 42P07: relation "data_retention_settings" already exists, skipping` — acceptable.

---

## 13. Risk analysis

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| H02A-R01 | Baseline executes on production | Critical | Dry-run gate; mark applied first; never `--include-all` casually |
| H02A-R02 | Model A leaves push blocked | High | Use Model B only |
| H02A-R03 | Staged A/B/C via out-of-order repair | High | Single push of eight; verify afterward as phases |
| H02A-R04 | Privilege revoke breaks legitimate clients | High | Smoke tests; prefer roll-forward GRANT migration |
| H02A-R05 | No cloud staging soak | Medium | Local rehearsal completed; dual prod approval mandatory |
| H02A-R06 | PITR/backup unavailable | Critical | Block H02B until confirmed |
| H02A-R07 | Archaeology provenance loss perception | Low | Archive + attached pre-repair list |
| H02A-R08 | DEFINER body/search_path residual | Medium | Accepted residual (H01.5-R07); not fixed by EXECUTE revoke alone |

---

## 14. Rehearsal steps (executed)

1. Safety check + validate  
2. Classify local Docker as approved target; reject cloud sibling  
3. Capture before-state (aligned 9 migrations, post-1.11 catalog)  
4. Simulate production metadata (revert 9; SQL fixture insert 12 archaeology — **fixture only**)  
5. Model A: mark baseline → dry-run **fails**  
6. Model B: revert 12 → dry-run lists 8 Phase 1.11  
7. Attempt staged A via out-of-order marks → CLI demands `--include-all` → abort pattern  
8. Single `db push --local --yes` of eight migrations → success  
9. Post verification SQL PASS  
10. Recovery: accidental baseline revert → dangerous include-all signal → re-mark applied → up to date  

Details: companion rehearsal report.

---

## 15. Verification requirements

Use `docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql` (+ H01.5 pack / phase-1-11*-verification as needed).

Pass criteria summarized in SQL file footer (RLS, 4 storage denies, retention objects, admin invoker, zero dangerous privs, sequence, DEFINER allowlist=2, empty client default ACL, FK comments).

---

## 16. Recovery strategy

| Failure | Action |
|---------|--------|
| Wrong metadata before DDL | Re-`repair` to prior statuses from preflight list; do not push |
| Baseline pending / dry-run includes baseline | **STOP**; mark baseline applied; never `--include-all` |
| Phase 1.11 apply error mid-push | Stop; inspect which versions applied; prefer roll-forward fix migration or PITR |
| Privilege breaks app | New forward migration restoring specific GRANT; avoid rewriting 1.11 files |
| Catastrophic | PITR to pre-apply recovery point; coordinate app rollback |

---

## 17. Production prerequisites

1. Human acceptance of H01.5 FAIL + this H02A CONDITIONAL PASS  
2. Production identity reconfirmed (`tchaye****xlvfu`)  
3. PITR / backup recovery point recorded  
4. Dual approval (engineering lead + ops/product)  
5. Maintenance window + on-call  
6. Dry-run matches rehearsal (exactly eight Phase 1.11)  
7. Monitoring / incident path available  
8. No concurrent schema changes  

---

## 18. Stop conditions

Block H02B / halt mid-run if any § stop list in the runbook is true (no rehearsal, uncertain identity, no PITR, dry-run mismatch, baseline may execute, verification fail, missing approvals, etc.).

---

## 19. Required approvals

| Gate | Approver |
|------|----------|
| Accept H02A evidence | Engineering (DB) |
| Production PITR confirm | Ops |
| Execute H02B runbook | Engineering lead + product/ops |
| Abort / PITR | Incident commander |

---

## 20. H02B go/no-go criteria

| Criterion | Status after H02A |
|-----------|-------------------|
| Successful non-production rehearsal of Model B | **Met** (local) |
| Cloud staging soak | **Not met** — none approved |
| Exact production commands documented | **Met** |
| Baseline never executed | **Met** (procedure + dry-run proof) |
| PITR confirmed on production | **Pending** |
| Dual human approval | **Pending** |

```text
H02B DECISION FROM H02A: PASS REHEARSAL EVIDENCE TO GO/NO-GO CHECKLIST
H02B EXECUTION: BLOCKED UNTIL CHECKLIST = GO
```

Do **not** begin H02B in this phase. See `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md`.
