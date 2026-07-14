# H01 — Migration History Reconciliation Plan

**Date:** 2026-07-14  
**Phase:** H01 (planning only)  
**Companion audit:** `docs/audits/h01-migration-history-reconciliation-audit-2026-07-14.md`  
**Audited commit:** `99526d72fca841fdc189eaf33720655a564675b0`  
**Linked project ref (non-secret):** `tchayecuvzssixyxlvfu`

---

## Explicit statement: no execution has occurred

**H01 did not execute any reconciliation, repair, push, reset, or remote SQL mutation.**  
This document is a plan for a future **H02 / deployment-gated** operation. All mutating commands below are marked:

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

---

## 1. Recommended reconciliation strategy

**Recommended: Option B — Align remote migration metadata with the governed active Git chain (baseline stamp + Phase 1.11), without replaying baseline DDL on production.**

### Intended end state

1. Remote `schema_migrations` reflects that production schema is already at **baseline-equivalent** catalog state.
2. Remote history records `20260714010000` as **applied** (metadata only).
3. Remote-only archaeology versions (`20260421` … `20261071`) are marked **reverted** (or otherwise retired per CLI semantics) so they no longer conflict with the active chain.
4. Phase 1.11A–C versions are then applied **once** as real forward migrations (DDL/ACL only), under environment gates.
5. `npx supabase migration list --linked` shows local and remote versions **aligned** for the nine active files.
6. `supabase/migrations-legacy/` remains archive-only forever for day-to-day work.

### Why this option

- Matches existing intent in `docs/database-baseline/schema-migrations-reconciliation.md` and Phase 1.11 PR gate H01.
- Unblocks safe forward `db push` / migrate without attempting a 684 KB baseline recreate on live data.
- Preserves legacy SQL for archaeology while making **active Git** the only operational history going forward.
- Reversibility of metadata repairs is better than pretending the disjoint 12 remote rows remain the source of truth for tooling.

---

## 2. Alternatives considered

### Option A — Preserve remote historical records; baseline is local-replay-only forever

| | |
|--|--|
| **Outcome** | Leave 12 remote rows untouched; never mark baseline applied; apply 1.11 via carefully crafted out-of-band process or accept tooling cannot use standard push |
| **Advantages** | Zero metadata writes; remote archaeology untouched |
| **Disadvantages** | Permanent `METADATA_DRIFT`; every future migration needs special-case tooling; high operator error risk |
| **Risk** | High (ongoing) |
| **Reversibility** | N/A (no change) |
| **Remote commands later** | Avoid standard `db push`; any apply path is custom and fragile |
| **Verdict** | Reject as primary strategy; acceptable only as temporary freeze |

### Option B — Align remote metadata to active Git chain (RECOMMENDED)

| | |
|--|--|
| **Outcome** | Repair metadata → apply 1.11 forward only |
| **Advantages** | Restores standard CLI workflow; matches governance docs |
| **Disadvantages** | Requires careful repair ordering; requires backups and gates |
| **Risk** | Medium if gated; Critical if ungated |
| **Reversibility** | Metadata repairs can often be re-repaired; DDL of 1.11 needs separate rollback SQL |
| **Remote commands later** | `migration repair` then controlled migrate/push for 1.11 only |

### Option C — Formal cutover point documentation without metadata rewrite

| | |
|--|--|
| **Outcome** | Written policy: “remote rows are pre-cutover archaeology; operators must never push”; apply security via approved one-shot SQL packages outside migration table |
| **Advantages** | Avoids CLI repair mistakes |
| **Disadvantages** | Bifurcates ops model; easy to violate; breaks CI/migrate assumptions |
| **Risk** | High (process) |
| **Reversibility** | Easy (docs only) |
| **Verdict** | Acceptable interim freeze, not long-term |

### Option D — Accepted divergence (leave as-is; do not apply 1.11 remotely)

| | |
|--|--|
| **Outcome** | Document risk; production keeps pre-1.11 privileges |
| **Advantages** | No operational change |
| **Disadvantages** | Leaves F-SEC / privilege findings unresolved in production |
| **Risk** | High (security debt remains live) |
| **Verdict** | Unacceptable once security apply is intended |

### Option E — Controlled Supabase repair + staged apply (implementation shape of B)

Same as B, with explicit env gates (dev → staging → production). This is the **execution profile** for Option B, detailed in §§7–10.

---

## 3. Exact proposed future commands

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

### 3.1 Preconditions / evidence (read-only — may be re-run)

```bash
git status
git branch --show-current
git rev-parse HEAD
npm run db:migrations:validate
npx supabase migration list --linked
```

Optional (only if separately approved as **read-only** SQL procedure — not part of H01 execution):

```bash
# EXAMPLE ONLY — requires approved read-only DB access pattern
# DO NOT EXECUTE DURING H01
# npx supabase db query --linked "select version, name from supabase_migrations.schema_migrations order by version;"
```

### 3.2 Backup confirmation (ops checklist — not CLI mutate of schema)

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

- Confirm PITR / automated backups enabled for target project.
- Optional: take a manual backup / snapshot per Supabase dashboard policy before repair.
- Record backup ID / timestamp in the deployment ticket.

### 3.3 Metadata repair (schema_migrations only — no baseline DDL)

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

Exact flags must be confirmed against `npx supabase migration repair --help` for the installed CLI at execution time. Anticipated shape for CLI 2.109.x:

```bash
# Mark remote-only archaeology as reverted (order may be batchable)
npx supabase migration repair --status reverted --linked \
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

# Mark production baseline as already applied (metadata only — MUST NOT run baseline SQL on live)
npx supabase migration repair --status applied --linked \
  20260714010000
```

**Critical rule:** Never `supabase db push` while baseline is still “pending” relative to remote, or the CLI may attempt to apply `20260714010000_production_baseline.sql` against a populated production database.

### 3.4 Verify metadata mid-gate

```bash
# Read-only verification after repair (still no push until list matches intent)
npx supabase migration list --linked
```

Expected after repair (illustrative):

- Baseline `20260714010000` present on **remote** as applied.
- Twelve archaeology versions no longer blocking / shown reverted per CLI display.
- Phase 1.11 versions still **local-only** until intentionally applied.

### 3.5 Apply Phase 1.11 forward migrations only

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

```bash
# After repair verification passes on the target environment:
npx supabase db push --linked
# OR environment-specific approved migrate path equivalent
```

Expected applied set:  
`20260714120000` … `20260714130200` (eight files).  
Baseline SQL file must **not** re-execute.

### 3.6 Post-apply verification

```bash
npx supabase migration list --linked
npm run db:migrations:validate
# Then run approved verification SQL packages from docs/audits/phase-1-11*-verification.sql
# via an approved read-only or controlled execute path — not invented ad hoc.
```

---

## 4. Command-by-command risk analysis

| Command | Mutates remote? | Risk | Failure mode | Mitigation |
|---------|:---------------:|------|--------------|------------|
| `migration list --linked` | No | None | Auth failure | Re-auth; do not relink casually |
| `db:migrations:validate` | No | None | Local filename fail | Fix only new files; never rewrite history |
| `migration repair --status reverted` | **Yes** (metadata) | Medium | Wrong version reverted; later confusion | Exact version list from live list; peer review; one env at a time |
| `migration repair --status applied` for baseline | **Yes** (metadata) | **High** if misunderstood | Marks applied without schema match | Confirm production ≈ baseline dump before marking; optional catalog compare |
| `db push --linked` post-repair | **Yes** (DDL/ACL) | **High** | Applies unexpected pending migrations; long locks | Confirm list shows only 1.11 pending; maintenance window; verify SQL |
| `db reset` remote | **Catastrophic** | — | Data loss | **Forbidden** |
| Hand `INSERT` into `schema_migrations` | **Yes** | High | Diverges from CLI expectations | **Forbidden** — use `migration repair` only |
| Re-adding legacy files to `migrations/` | No remote yet | High | Replay chaos | Forbidden without separate plan |

---

## 5. Preconditions

1. H01 audit accepted by engineering owner.
2. Working tree on intended release commit (prefer `main` SHA recorded in ticket).
3. `npm run db:migrations:validate` PASS.
4. Fresh `npx supabase migration list --linked` attached to ticket (no surprise versions).
5. Confirmation that target linked project is the intended environment (dev / staging / prod).
6. Backup / PITR confirmation recorded.
7. Agreement that baseline DDL will **never** run on populated production.
8. Phase 1.11 verification SQL reviewed for the target environment.
9. On-call / rollback owner named.
10. Optional but recommended: read-only spot-check that production still matches baseline-era expectations (table counts / key grants) before marking baseline applied.

---

## 6. Backup requirements

| Environment | Requirement before repair | Requirement before 1.11 apply |
|-------------|---------------------------|-------------------------------|
| Development | Snapshot or disposable reset OK | Prefer snapshot if shared |
| Staging | Snapshot / PITR confirm | Snapshot / PITR confirm |
| Production | **Mandatory** PITR + recorded recovery point | **Mandatory** + maintenance window |

Do not proceed on production if backup confirmation is missing.

---

## 7. Development deployment gate

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

**Purpose:** Practice repair + 1.11 apply on a non-production linked project or local linked clone **only if** a dedicated development Supabase project exists and is intentionally linked.

**Gate checklist**

- [ ] Confirm linked ref is **development**, not production (`tchayecuvzssixyxlvfu` is production-named — **do not** treat it as disposable).
- [ ] If only production is linked today: **do not** experiment with repair on it under a “dev gate.” Use local `supabase` + `--local` repair for dry-run of metadata semantics, or provision/link a true development project under a separate approval.
- [ ] Run repair → list → push → verification SQL.
- [ ] Document any CLI behavior surprises for staging.

**Human approval:** Engineering lead (database) for any command with `--linked` against a shared project.

---

## 8. Staging deployment gate

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

**Gate checklist**

- [ ] Staging project link verified (project ref recorded; secrets not pasted into tickets).
- [ ] Backup confirmed.
- [ ] Repair archaeology → applied baseline stamp.
- [ ] `migration list` matches expected mid-state.
- [ ] `db push` applies exactly eight 1.11 migrations.
- [ ] Run `phase-1-11a-b-verification.sql` + `phase-1-11c-verification.sql` (approved execute path).
- [ ] Application smoke: admin auth, booking read paths, storage public CDN reads, no client Data API privilege elevation.

**Human approval:** Engineering lead + staging owner.

---

## 9. Production deployment gate

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

**Gate checklist**

- [ ] Staging gate passed with evidence attached.
- [ ] Production backup / PITR recovery point recorded.
- [ ] Maintenance window communicated.
- [ ] Dual approval (engineering lead + product/ops owner).
- [ ] Repair only after re-listing production history (must still match H01 shape or ticket updated).
- [ ] Mark baseline applied **only** after catalog confidence check.
- [ ] Apply 1.11; immediately re-list migrations.
- [ ] Run verification SQL; spot-check critical RPCs and table privileges.
- [ ] Monitor error rates / auth failures for ≥30–60 minutes.

**Absolute prohibitions on production**

- `db reset`
- Applying `20260714010000_production_baseline.sql` as live DDL
- Restoring `migrations-legacy` into active `migrations/`
- Manual SQL edits to `schema_migrations` outside `migration repair`

---

## 10. Rollback and recovery plan

### 10.1 Metadata-only repair rollback

```text
DO NOT EXECUTE DURING H01
REQUIRES SEPARATE DEPLOYMENT APPROVAL
```

If repair marked wrong status before any DDL:

- Re-run `migration repair` to restore previous statuses using the pre-change `migration list` attachment as source of truth.
- Do **not** invent versions.

### 10.2 After Phase 1.11 DDL applied

- Prefer **forward-fix** migrations for any defect (do not rewrite 1.11 files).
- Emergency privilege restore would require a **new** approved migration reversing specific GRANTs/REVOKEs (not editing history).
- Catastrophic failure: PITR / restore to pre-apply recovery point (ops-owned; last resort).

### 10.3 Baseline mistakenly executed

- Treat as **severity** / restore scenario.
- Immediately stop further migration activity.
- Engage Supabase support / PITR; do not attempt ad-hoc DROP cascades without a dedicated incident plan.

---

## 11. Verification queries and checks

### 11.1 Always (read-only tooling)

```bash
npm run db:migrations:validate
npx supabase migration list --linked
```

Success criteria after full H02:

- All nine active versions show on both local and remote.
- No unexpected pending migrations.
- No archaeology versions remaining as conflicting pending entries.

### 11.2 Approved SQL packages (post-apply)

- `docs/audits/phase-1-11a-b-verification.sql`
- `docs/audits/phase-1-11c-verification.sql`

Execute only via an approved path on the target environment after deployment approval.

### 11.3 Optional pre-repair catalog confidence (read-only)

Examples of **non-mutating** checks (illustrative; require approved access):

- Count of `public` tables ≈ 173 (± known post-baseline changes)
- Presence of key tables (`bookings`, `cleaners`, `system_logs`)
- Sample: DEFINER execute grants still broad (expected pre-1.11)
- Confirm `data_retention_settings` **absent** before 1.11B apply

Do not run these in H01 without an existing approved read-only procedure.

---

## 12. Required approvals

| Gate | Approver roles | Approves |
|------|----------------|----------|
| H01 acceptance | Engineering (DB) | Audit completeness; strategy selection |
| H02 start | Engineering lead | Begin repair planning execution |
| Development / local dry-run | Engineering | Any `--linked` non-prod experiment |
| Staging apply | Engineering lead + staging owner | Repair + 1.11 on staging |
| Production apply | Engineering lead + ops/product owner | Repair + 1.11 on production |
| PITR / restore | Ops | Only if rollback requires restore |

---

## 13. Explicit statement that no execution has occurred

Reconfirmed:

- H01 produced documentation only (`docs/audits/…`, `docs/plans/…`).
- No `migration repair`, `db push`, remote SQL mutation, migration file edits, archive moves, or project relinks were performed.
- Live remote evidence collected solely via `npx supabase migration list --linked`.

**H02 decision recommendation (from H01):**  
**Approve H02 with prerequisites** (backups, env gates, dual production approval, confirm linked project identity, optional catalog confidence check).  
Do **not** approve ungated production repair.

---

## H01.5 addendum (2026-07-14) — strategy refinement

**Companion:** `docs/audits/h01-5-production-catalog-and-privilege-verification-2026-07-14.md`

Live production evidence supersedes the H01 “optional catalog confidence” checklist:

- Privileged DEFINER EXECUTE still open to `anon`/`authenticated` (including `admin_mark_payout_paid`, `invoke_nextjs_cron`)
- Storage deny policies absent; buckets present
- Dangerous client table privileges (~176 TRUNCATE) still present
- Default privileges still amplify to `anon`/`authenticated`
- Admin views lack `security_invoker`; `data_retention_settings` absent

**H02 strategy selection (exact):**

```text
CONTROLLED SCHEMA REMEDIATION THEN METADATA RECONCILIATION
```

**Not selected:** metadata-only reconciliation (Outcome A) — Phase 1.11 effects are materially missing.  
**Not selected:** block and investigate for unexplained structural drift (Outcome C) — catalog maps cleanly to pre-1.11 baseline + missing 1.11 deltas.

H02 execution still requires separate deployment approval; H01.5 executed **no** repair, push, or ACL changes. Option B remains the shape of work, with emphasis that **Phase 1.11 forward SQL is mandatory**, not optional, after metadata cutover.

---

## Appendix A — Version decision table (for H02 ticket)

| Version | Proposed repair status | Rationale |
|---------|------------------------|-----------|
| 20260421 | `reverted` | Remote archaeology; collapsed into baseline |
| 20260511172349 | `reverted` | Remote stamp / placeholder dual history |
| 20260512065718 | `reverted` | Same |
| 20260512081348 | `reverted` | Same |
| 20260512084920 | `reverted` | Same |
| 20260512090115 | `reverted` | Same |
| 20260512092414 | `reverted` | Same |
| 20260512104544 | `reverted` | Same |
| 20260512110146 | `reverted` | Same |
| 20260512115242 | `reverted` | Same |
| 20261053 | `reverted` | Remote short stamp; content in baseline era |
| 20261071 | `reverted` | Remote short stamp; content in baseline era |
| 20260714010000 | `applied` | Metadata cutover; DDL already embodied in prod |
| 2026071412xxxx / 130xxx | *(apply via push)* | Real forward migrations after cutover |

Final status choices must be re-validated against CLI behavior on a non-production rehearsal whenever possible.

---

## H02A addendum (2026-07-14) — rehearsal confirmation

**Companions:**
- `docs/plans/h02a-controlled-security-remediation-rehearsal-plan-2026-07-14.md`
- `docs/audits/h02a-non-production-rehearsal-verification-2026-07-14.md`
- `docs/runbooks/h02b-production-security-remediation-runbook-2026-07-14.md`

Local Docker rehearsal **confirmed** Appendix A status choices:

| Item | H02A evidence |
|------|----------------|
| Revert all 12 remote-only versions | **Required** — retaining them blocks `db push` (Model A FAIL) |
| Mark `20260714010000` applied without SQL | **Required and proven** — dry-run then excludes baseline |
| Apply Phase 1.11 via `db push` | **Exactly eight files** after Model B cutover |
| Staged A→B→C via temporary out-of-order `repair --status applied` | **Not CLI-compatible** without `--include-all` (unsafe) |

```text
H02A STATUS: COMPLETE — APPROVED (local rehearsal; limitations documented)
H02B: GO/NO-GO CHECKLIST REQUIRED — DO NOT EXECUTE IN H01/H02A
```
