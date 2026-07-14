# H01 — Migration History Reconciliation Audit

**Date:** 2026-07-14  
**Phase:** H01 (read-only planning and verification)  
**Status:** COMPLETE — CONDITIONAL PASS (evidence gaps remain for live production catalog)  
**Auditor commit:** `99526d72fca841fdc189eaf33720655a564675b0` (`main` = `origin/main`)  
**Linked Supabase project ref (non-secret):** `tchayecuvzssixyxlvfu` (`shalean-platform`)

---

## 1. Executive summary

Active Git migrations are a clean **baseline-era chain of 9 files**: one production schema baseline plus eight Phase 1.11A–C security/ops deltas. Filename validation **passes**. Historical SQL (427 files) lives only in `supabase/migrations-legacy/` and is intentionally excluded from replay.

Live remote migration metadata (`npx supabase migration list --linked`, 2026-07-14) shows **zero overlap** with the active Git chain:

| Side | Count | Versions |
|------|------:|----------|
| Remote-only | **12** | `20260421` … `20261071` |
| Local-only (active) | **9** | `20260714010000` … `20260714130200` |
| Both | **0** | — |

The production baseline was **extracted from** production and is intended for **fresh local replay**, not re-application to live data. Phase 1.11 migrations exist in Git and have been locally verified in prior work, but **are not recorded remotely** — they must not be applied until history repair is approved under a separate deployment gate.

**Schema drift vs production catalog was not re-queried in H01.** Repository and remote-metadata evidence are strong for metadata drift; live privilege/object catalog confirmation remains an evidence gap.

---

## 2. Scope

**In scope**

- Active `supabase/migrations/` inventory and governance validation
- `supabase/migrations-legacy/` archive inventory
- Git timeline for migrations, validator, and baseline docs
- Baseline SQL analysis (structure/intent, not rewrite)
- Read-only remote migration list against the already-linked project
- Cross-comparison matrix, risks, options, exit criteria

**Out of scope (explicit)**

- H02 implementation
- Any remote mutation (`db push`, `migration repair`, SQL against remote DBs)
- Editing migrations, archives, or `schema_migrations`
- Relinking Supabase projects
- General database remediation beyond migration-history reconciliation

---

## 3. Safety boundary

During H01 the following were **not** executed and remain prohibited until a separate deployment approval:

- `supabase db push`
- `supabase migration repair`
- `supabase db remote commit`
- `supabase db reset` against any linked remote
- `supabase migration up` against remote
- SQL against development / staging / production
- Edits to `supabase_migrations.schema_migrations`
- Rename / delete / rewrite of historical migration files
- New reconciliation or schema migrations
- Supabase project reconfiguration / relink

Only local read-only Git inspection, filename validation, document reads, and `npx supabase migration list --linked` (metadata list) were used for remote evidence.

---

## 4. Repository state

| Check | Result |
|-------|--------|
| Branch | `main` |
| Working tree | Clean (`nothing to commit`) |
| `HEAD` | `99526d72fca841fdc189eaf33720655a564675b0` |
| `origin/main` | `99526d72fca841fdc189eaf33720655a564675b0` (identical) |
| Tip merge | `Merge pull request #2 from shalean-developer/fix/database-phase-111-security-hardening` |
| Prior baseline merge | PR #1 `chore/database-schema-baseline` → `01312867` on `development` |

**Context statements verified**

| Claim | Verified? | Evidence |
|-------|:---------:|----------|
| `main` clean and synced with `origin/main` | Yes | `git status` / `git rev-parse` |
| Active migrations = baseline + Phase 1.11 | Yes | 9 files listed below |
| Legacy archive exists | Yes | `supabase/migrations-legacy/` (427 SQL) |
| Migration-history reconciliation not yet authorized | Yes | No repair commit; prior docs = documentation only |
| No remote migration repair approved/executed | Yes | Remote list still lacks baseline + 1.11 |

---

## 5. Active migration inventory

**Directory:** `supabase/migrations/`  
**Validation:** `npm run db:migrations:validate` → **PASS** (9 files, 9 unique 14-digit timestamps)  
**Policy:** `docs/database-baseline/migration-governance.md`

| Filename | Timestamp | Purpose | Introduced | Class | Immutable historical? | Validation |
|----------|-----------|---------|------------|-------|----------------------|------------|
| `20260714010000_production_baseline.sql` | 20260714010000 | Replayable production schema dump (processed) | `b755e7f9` | **Baseline** | Yes (do not rewrite) | OK |
| `20260714120000_phase_111a_definer_rpc_execute_lockdown.sql` | 20260714120000 | Lock DEFINER EXECUTE (service_role + exceptions) | `1b945a18` | Incremental | Yes | OK |
| `20260714120100_phase_111a_storage_least_privilege_policies.sql` | 20260714120100 | Storage bucket ensure + deny client policies | `1b945a18` | Incremental | Yes | OK |
| `20260714120200_phase_111b_admin_views_security_invoker.sql` | 20260714120200 | Admin views → `security_invoker` + revoke client SELECT | `1b945a18` | Incremental | Yes | OK |
| `20260714120300_phase_111b_log_retention_controls.sql` | 20260714120300 | Retention settings + batched prune RPCs | `1b945a18` | Incremental | Yes | OK |
| `20260714120400_phase_111b_cascade_fk_audit_comments.sql` | 20260714120400 | COMMENT documentation on cascade FKs | `1b945a18` | Incremental | Yes | OK |
| `20260714130000_phase_111c_revoke_service_role_only_table_grants.sql` | 20260714130000 | Revoke anon/auth on service-only tables | `a7bb5603` | Incremental | Yes (later tightened in `ef1e814a`) | OK |
| `20260714130100_phase_111c_strip_dangerous_client_table_privileges.sql` | 20260714130100 | Strip TRUNCATE/TRIGGER/REFERENCES/MAINTAIN from client DML | `a7bb5603` | Incremental | Yes (later tightened) | OK |
| `20260714130200_phase_111c_default_privileges_hardening.sql` | 20260714130200 | Revoke default privileges amplifier for postgres→anon/auth | `a7bb5603` | Incremental | Yes (later tightened) | OK |

**Ordering dependencies**

1. Baseline must apply first on empty local DB (creates full catalog).
2. Phase 1.11A–C files are strictly ordered by timestamp; each assumes baseline objects exist.
3. 1.11A DEFINER/storage → 1.11B views/retention/comments → 1.11C table grants / strip / defaults.
4. Active chain does **not** depend on replaying `migrations-legacy`.

---

## 6. Archived migration inventory

| Location | Present? | SQL files | Role |
|----------|:--------:|----------:|------|
| `supabase/migrations-legacy/` | Yes | **427** | Intentional archive; CLI ignored |
| `supabase/migrations_archive/` | No | — | — |
| `supabase/archive/` | No | — | — |
| `supabase/migrations-archive/` | No | — | — |

**Archive strategy (documented):** `docs/database-baseline/migration-governance.md` — legacy retained for archaeology; not moved back without remediation plan. Validator warns: *Ignoring archive directory supabase/migrations-legacy*.

**Timestamp range (legacy filenames)**

- Earliest named stamp: `20260421_*`
- Latest named stamp: `20261075_*`
- Oddities: `supabase-bookings.sql` (no stamp); `202606161331_zoho_invoice_ids.sql` (12-digit prefix)

**Filename format distribution (legacy)**

| Pattern | Count |
|---------|------:|
| 14-digit prefix | 13 |
| 8-digit prefix (not 14) | 412 |
| Other | 2 |

**Duplicate short timestamps (sample of systemic issue):** ≥20 stamp collisions (pairs/triples), e.g. `20261034` (3 files), `20260424`, `20260508`, … — this is a primary reason the archive is **unreplayable** as an ordered chain.

**Remote history placeholders in legacy** (content literally `select 1;`):

- `20260511172349_remote_history_placeholder.sql` … `20260512115242_remote_history_placeholder.sql` (9 files)

**Semantic SQL for those same remote versions** exists under **different** Git stamps (DUPLICATE_HISTORY):

| Remote version | Semantic legacy file (approx) |
|----------------|-------------------------------|
| 20260511172349 | `20260933_cleaners_joined_at_repair.sql` |
| 20260512065718 | `20260935_resolve_auth_user_id_by_email_and_link.sql` |
| 20260512081348 | `20260936_bookings_payment_method_chk_add_eft_card.sql` |
| 20260512084920 | `20260937_h5_legacy_completed_payment_status_repair.sql` |
| 20260512090115 | `20260938_h10_cleaner_financial_rls_identity_fix.sql` |
| 20260512092414 | `20260939_h6_h4_user_profiles_backfill.sql` |
| 20260512104544 | `20260940_h12_dispute_admin_audit_fields.sql` |
| 20260512110146 | `20260941_cron_run_leases.sql` |
| 20260512115242 | `20260942_h14_m19_hot_path_composite_indexes.sql` |

**Files represented by production baseline:** the entire pre-baseline schema evolution collapsed into `20260714010000_production_baseline.sql`. Legacy files are the historical authors of that schema, not the active replay path.

---

## 7. Git migration timeline

| # | Era | Evidence | Notes |
|---|-----|----------|-------|
| 1 | Historical migration development | Long `git log --follow -- supabase/migrations` pre-`b755e7f9` | Hundreds of incremental `.sql` files in active dir |
| 2 | Migration archive creation | `b755e7f9` — `R100` moves `supabase/migrations/*` → `supabase/migrations-legacy/*` | 427 files archived in one commit |
| 3 | Production baseline introduction | Same commit adds `20260714010000_production_baseline.sql` + governance docs | PR #1 |
| 4 | Validation governance | Same commit: `scripts/validate-supabase-migrations.mjs`, `npm run db:migrations:validate`, `.github/workflows/migration-governance.yml` | CI filename policy |
| 5 | Phase 1.11A–B | `1b945a18` + reconciliation doc | 5 forward migrations |
| 6 | Phase 1.11C | `a7bb5603` (add) → `ef1e814a` / `8f78f12e` (tighten + verify) | 3 privilege migrations |
| 7 | Current repository state | `99526d72` merge PR #2 into `main` | Clean active set of 9 |

---

## 8. Baseline analysis

| Attribute | Finding |
|-----------|---------|
| Filename / timestamp | `20260714010000_production_baseline.sql` |
| Size / hash | ~684 KB; SHA-256 `6347E10859F38FA49CB36565A7CE16BB3CBC33D06B46C084D273F4FF01A5E21E` |
| Stated source (header) | `docs/database-baseline/production-schema-source.sql` (SHA-256 `9301dd5a…`) |
| Source files in Git now | **Absent** (only review/governance markdown remains under `docs/database-baseline/`) |
| Header status text | Still says `DRAFT — do not apply to production; do not add to supabase/migrations yet` — **stale header** vs current governed role |
| Intended use | Fresh **local** replay (`db reset`); **not** re-apply onto live production |
| Point-in-time claim | Extracted from production project `tchayecuvzssixyxlvfu` around 2026-07-13 processing (`processed-baseline-review.md`) |
| Data migrations | No top-level seed `COPY`; `INSERT INTO` appearances are **inside function bodies** (runtime DML), not production data load |
| Ownership | All `OWNER TO` removed in preprocessing (0 ownership reassignment statements) |
| Privileges | Broad `GRANT ALL` patterns retained from dump (later hardened by 1.11C on local/fresh DBs) |
| Extensions | `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp` |

**Approximate object counts in baseline SQL**

| Object class | Approx count |
|--------------|-------------:|
| Tables (`CREATE TABLE`) | 173 |
| Views | 13 |
| Materialized views | 2 |
| Functions | 105 |
| Indexes (explicit CREATE INDEX) | 402 |
| Policies | 113 |
| RLS enable | 173 |
| Trigger constructions (pattern match) | 29 |
| Enums/types | 3 |
| Extensions | 6 |
| GRANT statements | 856 |

**Later migrations that intentionally modify baseline state:** all eight Phase 1.11A–C files (security, storage, views, retention, privileges).

**Local replay verification (prior, repository evidence):** `docs/database-baseline/local-replay-verification.md` — PASS WITH FINDINGS against local Docker DB (not re-run in H01).

---

## 9. Remote migration history

**Command (read-only):** `npx supabase migration list --linked`  
**CLI:** Supabase 2.109.1  
**Link evidence:** `supabase/.temp/project-ref` → `tchayecuvzssixyxlvfu`  
**Config:** `supabase/config.toml` documents active vs legacy dirs; no project secrets in config.

### Local versions (active Git)

`20260714010000`, `20260714120000`, `20260714120100`, `20260714120200`, `20260714120300`, `20260714120400`, `20260714130000`, `20260714130100`, `20260714130200`

### Remote versions (live list 2026-07-14)

| Remote version | Local? | Legacy / notes |
|----------------|:------:|----------------|
| 20260421 | No | Matches short stamp family; multiple legacy files begin `20260421*` |
| 20260511172349 | No | Placeholder + semantic under `20260933_*` |
| 20260512065718 | No | Placeholder + semantic under `20260935_*` |
| 20260512081348 | No | Placeholder + semantic under `20260936_*` |
| 20260512084920 | No | Placeholder + semantic under `20260937_*` |
| 20260512090115 | No | Placeholder + semantic under `20260938_*` |
| 20260512092414 | No | Placeholder + semantic under `20260939_*` |
| 20260512104544 | No | Placeholder + semantic under `20260940_*` |
| 20260512110146 | No | Placeholder + semantic under `20260941_*` |
| 20260512115242 | No | Placeholder + semantic under `20260942_*` |
| 20261053 | No | `20261053_location_gsc_period_trends.sql` in legacy |
| 20261071 | No | `20261071_booking_fulfillment_mode_and_demand.sql` in legacy |

**Summary**

| Category | Result |
|----------|--------|
| Local-only | All 9 active versions |
| Remote-only | All 12 remote versions |
| Ordering differences | Chains are disjoint; no shared ordering |
| Baseline in remote | **No** |
| Phase 1.11 in remote | **No** |
| Duplicate / malformed | Remote uses short (`20260421`, `20261053`, `20261071`) and 14-digit mixed stamps; Git archive duplicates many short stamps |

Matches prior documentation in `docs/database-baseline/schema-migrations-reconciliation.md` and phase-1.11 audit F-MIG-001.

**Secrets:** No access tokens, DB passwords, service-role keys, or connection strings are reproduced in this report.

---

## 10. Production schema evidence

| Evidence type | Location / source | Confidence for “current production catalog” |
|---------------|-------------------|-----------------------------------------------|
| Production baseline SQL in Git | `supabase/migrations/20260714010000_production_baseline.sql` | High for **baseline-era** schema shape; not a live re-query |
| Processed baseline review | `docs/database-baseline/processed-baseline-review.md` | High for preprocessing decisions |
| Local replay verification | `docs/database-baseline/local-replay-verification.md` | High for **local** DB after baseline apply |
| Phase 1.11 health audit | `docs/audits/phase-1-11-database-health-audit-2026-07-14.md` | Prior live CLI/advisors evidence (pre/at 1.11 planning) |
| Privilege audit / 1.11C | `docs/audits/phase-1-11c-privilege-audit-remediation-2026-07-14.md` | Repo + local; remote apply blocked |
| Verification SQL (local) | `docs/audits/phase-1-11a-b-verification.sql`, `phase-1-11c-verification.sql` | Local gates |
| PR review | `docs/audits/phase-1-11c-pr-review-2026-07-14.md` | Documents H01 gate for remote apply |
| Remote migration metadata | Live `migration list --linked` (H01) | High for **history table**, not object catalog |
| H01 live production SQL catalog dump | **Not collected** | — |

**Explicit distinction**

| Layer | Status in H01 |
|-------|----------------|
| Repository evidence | Strong |
| Remote migration metadata | Strong (fresh list) |
| Actual production schema (live objects/grants) | **Not freshly verified** |
| Unverified assumptions | Production catalog still ≈ baseline dump; little/no silent dashboard DDL since baseline; 1.11 privileges absent on production |

Assumption basis: baseline was extracted from production; forward 1.11 SQL is local-only in metadata; no approved remote apply of 1.11.

---

## 11. Reconciliation matrix

| Version or object | Active local | Archived | Git evidence | Remote history | Baseline representation | Production schema evidence | Status |
|-------------------|--------------|----------|--------------|----------------|-------------------------|----------------------------|--------|
| `20260714010000` baseline | Yes | N/A (collapsed) | `b755e7f9` | Absent | Self | Dump-era repo evidence only | `LOCAL_ONLY` + `EXPECTED_BASELINE_COLLAPSE` |
| `20260714120000`–`130200` (1.11) | Yes | No | `1b945a18`/`a7bb5603`/… | Absent | Modifies baseline privileges/objects | Not applied remotely (metadata) | `LOCAL_ONLY` |
| Remote `20260421` | No | Yes (family) | Legacy archive | Present | Collapsed into baseline | Objects likely in baseline | `REMOTE_ONLY` + `EXPECTED_BASELINE_COLLAPSE` |
| Remote `20260511*`–`20260512*` (9) | No | Placeholders + alternate stamps | Placeholders + `20260933`–`042` | Present | Collapsed into baseline | Pre-baseline remote apply archaeology | `REMOTE_ONLY` + `DUPLICATE_HISTORY` |
| Remote `20261053` | No | Yes | Legacy file | Present | In baseline catalog (assumed) | Metadata only | `REMOTE_ONLY` + `EXPECTED_BASELINE_COLLAPSE` |
| Remote `20261071` | No | Yes | Legacy file | Present | In baseline catalog (assumed) | Metadata only | `REMOTE_ONLY` + `EXPECTED_BASELINE_COLLAPSE` |
| Active ↔ remote intersection | — | — | — | Empty | — | — | `METADATA_DRIFT` |
| Legacy duplicate timestamps | No (archived) | Many collisions | Historical | N/A | Solved by baseline | N/A | `ORDERING_RISK` (archive only) |
| Live prod grants vs 1.11C target | Target in Git | — | Yes | Not recorded | Baseline still broad GRANT ALL | No H01 live grant query | `INSUFFICIENT_EVIDENCE` (for SCHEMA_DRIFT label) |
| Fresh local reset catalog | Matches chain | Ignored | Yes | N/A | Baseline + 1.11 | Prior local verify | `MATCH` (local) |

---

## 12. Drift classification

### Migration metadata drift — **CONFIRMED**

Disjoint local vs remote version sets; baseline and Phase 1.11 missing remotely; 12 remote archaeology versions missing from active Git.

### Schema drift — **NOT LABELED AS CONFIRMED IN H01**

No fresh production catalog comparison in this phase. **Possible / expected:** Phase 1.11 privilege and related objects absent on production (`POSSIBLE_DRIFT` / `INSUFFICIENT_EVIDENCE`). Baseline-era structural objects are believed present via dump provenance.

### Git-history drift — **GOVERNED, NOT DRIFT**

Archive + baseline cutover is intentional (`EXPECTED_BASELINE_COLLAPSE`). Active tree matches policy.

### Evidence confidence

| Domain | Confidence |
|--------|------------|
| Active Git migrations | **High** |
| Archive inventory | **High** |
| Remote metadata | **High** (live list) |
| Baseline intent / local replay | **High** (docs + prior verify) |
| Current production object/privilege catalog | **Medium–Low** (stale unless re-audited) |

---

## 13. Risks

| H01 risk ID | Severity | Likelihood | Evidence | Impact | Timing | Next action | Deployment gate? |
|-------------|----------|------------|----------|--------|--------|-------------|------------------|
| H01-R01 | Critical | Certain | Live `migration list` disjoint | Blind `db push` may attempt baseline replay or wrong ordering on live DB | Immediate if anyone runs push | Block all remote migrate until repair plan approved | **Yes** |
| H01-R02 | High | Certain | Baseline absent remotely | Forward migrate tooling cannot treat baseline as applied | Deployment-related | Repair baseline as `applied` (H02, approved) | **Yes** |
| H01-R03 | High | Certain | 1.11 versions LOCAL_ONLY | Production remains on pre-1.11 privilege posture | Deployment-related | After history repair, apply 1.11 under gates | **Yes** |
| H01-R04 | High | High | 12 REMOTE_ONLY versions | Repair status (`applied`/`reverted`) choice affects CLI behavior | Deployment-related | Document per-version repair decision | **Yes** |
| H01-R05 | Medium | High | Placeholder vs semantic stamp dual history | Confusion / duplicate apply attempts if files restored to active | Engineering | Keep archive read-only; never restore placeholders to active | No (policy) |
| H01-R06 | Medium | Medium | Checksums not compared for remote rows | Repair assumes metadata-only fix | Deployment-related | Prefer CLI `migration repair`; avoid hand SQL | **Yes** |
| H01-R07 | Medium | Medium | Short duplicate stamps in archive | Cannot reproduce prod history from legacy alone | Engineering | Accept baseline collapse as source of truth for replay | No |
| H01-R08 | Medium | Medium | Stale baseline SQL header (“DRAFT”) | Operator misreads intent | Process | Clarifying comment in H02 docs only (no content rewrite of DDL) | Soft |
| H01-R09 | Medium | Medium | Source dump files not in Git | Harder to re-diff baseline provenance | Engineering | Treat baseline file + review docs as retained evidence | No |
| H01-R10 | High | Medium | Possible silent dashboard DDL since dump | Schema may diverge without migration row | Unknown until live audit | Optional approved read-only catalog compare before H02 exec | Soft / recommended |
| H01-R11 | Medium | Low–Med | Prior undocumented repairs | History may already be atypical | Engineering | Treat current 12 rows as authoritative remote state | Investigate in H02 prep |
| H01-R12 | High | Certain (local vs remote) | Clean DB replay ≠ remote history story | Environments tell different migration stories | Continuous until repaired | Formal cutover + repair | **Yes** |

---

## 14. Evidence gaps

1. **Live production object/privilege inventory** not recollected in H01 (no remote SQL).
2. **Staging / development** remote histories not listed separately (only linked project — appears production named `shalean-platform`).
3. **Original production-schema-source.sql** not present in repository (hash recorded in review only).
4. **Checksum / `schema_migrations` name columns** not queried via SQL (CLI list used instead).
5. Whether any **dashboard DDL** landed after baseline dump is unverified.
6. Confirm whether linked project is exclusively production vs shared (name suggests production; org/project naming only).

---

## 15. Conclusions

1. Local governance of the active migration chain is **healthy** (9 validated files; archive intentional).
2. Remote migration metadata is in a **known, severe METADATA_DRIFT** state relative to Git (F-MIG-001 confirmed live).
3. The baseline correctly represents a **collapsed** production schema for local replay; it must **not** be executed against live production.
4. Phase 1.11 security migrations are **merged to `main` but not present in remote history** — production apply remains blocked.
5. H01 should not execute repair; H02 may proceed only with explicit deployment gates and backups.
6. Labeling production **schema drift** for 1.11 requires a follow-up read-only catalog check or treats absence of remote versions as sufficient **operational** proof that SQL was not applied via migration tooling.

---

## 16. H01 exit-criteria checklist

| Criterion | Met? |
|-----------|:----:|
| Repository safety check recorded | Yes |
| Active migration inventory complete | Yes |
| Archive inventory complete | Yes |
| Git timeline documented | Yes |
| Baseline analyzed (no rewrite) | Yes |
| Remote migration list (read-only) collected | Yes |
| Production schema evidence inventory + gaps stated | Yes |
| Reconciliation matrix + classifications | Yes |
| Risks with IDs | Yes |
| ≥3 reconciliation options in companion plan | Yes (plan doc) |
| No mutating commands executed | Yes |
| H02 not started | Yes |

**H01 verdict:** **CONDITIONAL PASS** — reconciliation state sufficiently mapped; live production catalog comparison remains an intentional gap before asserting SCHEMA_DRIFT.

---

## H01.5 addendum (2026-07-14) — do not rewrite H01 conclusions above

**Cross-reference:** `docs/audits/h01-5-production-catalog-and-privilege-verification-2026-07-14.md`  
**Read-only SQL:** `docs/audits/sql/h01-5-production-catalog-verification-2026-07-14.sql`

H01.5 closed the live catalog gap on linked production `shalean-platform` (`tchaye****xlvfu`) using SELECT-only queries.

| H01 statement | H01.5 update |
|---------------|--------------|
| Schema drift unlabeled / insufficient live catalog | **Phase 1.11 privilege, policy, function, default-ACL, and view-invoker drift CONFIRMED** vs governed Git state |
| Baseline structural presence assumed | **Supported:** 175/175 public tables RLS-on; expected extensions; service-only tables present except `data_retention_settings` (1.11B) |
| Metadata drift | **Still confirmed** (unchanged) |
| Recommended next step | H02 = **controlled schema remediation (apply 1.11A–C) then metadata reconciliation** — not metadata-only |

H01 historical CONDITIONAL PASS stands for **H01’s own exit criteria** (metadata mapping). Production readiness for metadata-only H02 is superseded by H01.5 **FAIL** against the post-1.11 governed target.
