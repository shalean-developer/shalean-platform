# H01.5 — Read-Only Production Catalog and Privilege Verification

**Date:** 2026-07-14  
**Phase:** H01.5 (read-only)  
**Status:** FAIL — material privilege / Phase 1.11 security drift confirmed  
**Auditor commit:** `99526d72fca841fdc189eaf33720655a564675b0` (`main` = `origin/main`)  
**Linked Supabase project (masked):** `tchaye****xlvfu` (`shalean-platform`, eu-west-3)  
**Companion SQL:** `docs/audits/sql/h01-5-production-catalog-verification-2026-07-14.sql`  
**Predecessor:** `docs/audits/h01-migration-history-reconciliation-audit-2026-07-14.md`

---

## 1. Executive summary

Live production catalog queries against the already-linked `shalean-platform` project confirm that **production still matches the pre–Phase 1.11 privilege posture** documented in the Phase 1.11 database health audit. Structural baseline compatibility remains strong (175/175 public tables RLS-enabled; expected extensions present; service-only table set present except intentional 1.11B object `data_retention_settings`).

**Phase 1.11A–C security effects are not present on production.** Dangerous client privileges, unrestricted DEFINER EXECUTE grants, missing storage deny policies, non-invoker admin views, open default privileges, and absent retention controls were all reconfirmed live.

**H02 strategy:**

```text
H02 STRATEGY: CONTROLLED SCHEMA REMEDIATION
THEN METADATA RECONCILIATION
DO NOT APPLY BASELINE DDL TO PRODUCTION
APPLY PHASE 1.11A–C FORWARD AFTER METADATA CUTOVER (OR APPROVED EQUIVALENT)
```

H01.5 Outcome classification maps to **Outcome B** (partial / expected pre-hardening security drift vs governed Git state; no unexplained structural blocker), with formal H01.5 status **FAIL** against the post-1.11 governed target.

---

## 2. Scope

**In scope**

- Verify repository still matches H01 commit/chain
- Inventory expected state from baseline + Phase 1.11A/B/C SQL
- Confirm linked production project identity
- Run read-only catalog / privilege SELECTs against production
- Classify drift for H02 strategy selection
- Document risks and exit checklist

**Out of scope**

- H02 execution
- Any remote mutation (`db push`, `migration repair`, GRANT/REVOKE/ALTER/CREATE/DROP, baseline/1.11 apply)
- Rewriting historical migrations
- General remediation beyond evidence collection

---

## 3. Safety boundary

During H01.5 the following were **not** executed:

- `supabase db push` / `migration repair` / `migration up` / `db reset` / `db remote commit`
- Baseline or Phase 1.11 SQL application
- `ALTER` / `CREATE` / `DROP` / `TRUNCATE` / `GRANT` / `REVOKE` / DML
- Edits to `supabase_migrations.schema_migrations`
- Project relinking, secret rotation, config mutation
- Commits or pushes

Only local read-only Git inspection, migration filename validation, `npx supabase migration list --linked`, `npx supabase status` (local), `npx supabase db query --linked` with SELECT statements, and Supabase MCP `list_projects` / `get_project` / `execute_sql` (SELECT only) were used.

---

## 4. Repository state

| Check | Result |
|-------|--------|
| Branch | `main` |
| `HEAD` | `99526d72fca841fdc189eaf33720655a564675b0` |
| `origin/main` | identical |
| Working tree (start) | Clean tracked tree; untracked H01 audit/plan docs present |
| Active migrations | **9** (baseline + 1.11A–C) |
| Legacy archive | **427** SQL files |
| `npm run db:migrations:validate` | **PASS** |

Prior H01 claims (disjoint local/remote migration versions; baseline + 1.11 absent remotely) **remain true** after recheck.

---

## 5. Linked-project identity verification

| Item | Evidence |
|------|----------|
| Linked ref (`.temp/project-ref`) | `tchayecuvzssixyxlvfu` → documented as `tchaye****xlvfu` |
| Linked name | `shalean-platform` |
| MCP `get_project` | name `shalean-platform`, region `eu-west-3`, status `ACTIVE_HEALTHY`, Postgres 17.x |
| Org siblings | Separate project `shalean project` (`qpqn****ejrb`, eu-west-1) — **not** the linked target |
| Production confirmation | Independent of CLI link: MCP project list + get_project match name/region/age (created 2026-04-21) used in H01 |
| Connection method | Management API via `npx supabase db query --linked` and MCP `execute_sql` |
| Access mode | SELECT / catalog reads only |

`supabase status` reflected **local** stack endpoints only and was not used as production identity.

---

## 6. Evidence sources

| Evidence source | Purpose | Date | Commit | Trusted for | Limitations |
| --------------- | ------- | ---- | ------ | ----------- | ----------- |
| `supabase/migrations/20260714010000_production_baseline.sql` | Expected structural baseline | 2026-07-14 | `b755e7f9` / merge `01312867` | Extensions, schemas, table/RLS baseline shape | Huge; privilege pattern is pre-1.11; do not execute on prod |
| `20260714120000` … `20100` (1.11A) | DEFINER lockdown + storage deny policies | 2026-07-14 | `1b945a18` | Expected EXECUTE + storage policy state | Not in remote metadata |
| `20260714120200` … `20400` (1.11B) | Admin view invoker, retention, FK comments | 2026-07-14 | `1b945a18` | Expected view/retention/comment state | Not in remote metadata |
| `20260714130000` … `30200` (1.11C) | Service-only revoke, dangerous priv strip, default ACL | 2026-07-14 | `a7bb5603`–`ef1e814a` | Expected grants/default privileges | Not in remote metadata |
| `docs/audits/phase-1-11a-b-verification.sql` | Local/approved verify recipes | 2026-07-14 | Phase 1.11 PR | Expected check lists | Prior procedural DO blocks not reused against prod |
| `docs/audits/phase-1-11c-verification.sql` | 1.11C contract lists | 2026-07-14 | Phase 1.11 PR | Service-only table list | Mutating DO verify not run on prod |
| `docs/audits/phase-1-11-database-health-audit-2026-07-14.md` | Pre-remediation live baseline | 2026-07-14 | prior | Historical prod privilege findings | Stale until H01.5; used as comparison baseline |
| H01 audit/plan (2026-07-14) | Metadata drift + strategy | 2026-07-14 | `99526d72` | Migration history drift | Explicitly lacked live catalog |
| Live H01.5 catalog SELECTs | Actual production state | 2026-07-14 | n/a | RLS/grants/policies/functions/defaults | Snapshot at observation time |
| `npx supabase migration list --linked` | Remote migration rows | 2026-07-14 | n/a | Metadata only | Not schema proof |
| `supabase/migrations-legacy/` | Archaeology | historical | various | Context for remote-only versions | Unreplayable |

---

## 7. Expected production state (derived from Git SQL)

### Extensions

| Extension | Schema | Status |
|-----------|--------|--------|
| `pg_cron` | `pg_catalog` | Required (baseline) |
| `pg_net` | `public` | Required (baseline; known hygiene debt F-SEC-006) |
| `pg_stat_statements` | `extensions` | Required |
| `pgcrypto` | `extensions` | Required |
| `supabase_vault` | `vault` | Required |
| `uuid-ossp` | `extensions` | Required |
| `plpgsql` | `pg_catalog` | Platform expected |

### Phase 1.11A

- All public SECURITY DEFINER functions (except marketing + RLS helpers allowlist): EXECUTE revoked from `PUBLIC`/`anon`/`authenticated`; granted to `service_role`
- Allowlist EXECUTE: `public_review_banner_stats`, `public_marketing_reviews_for_area` → anon+auth+service
- RLS helpers: `user_owns_booking`, `user_has_booking_with_cleaner` → auth+service only
- Storage buckets ensured; four `phase111a_deny_*` policies on `storage.objects`

### Phase 1.11B

- 12 `admin_*` views: `security_invoker=true`; client SELECT revoked; service SELECT granted
- `data_retention_settings` table + RLS + service grants; seed rows; `prune_notification_logs(int,int)`; batched `prune_system_logs`
- CASCADE FK COMMENT metadata on audited financial FKs

### Phase 1.11C

- ~117 service-only tables: zero anon/authenticated privileges; service_role ALL retained
- Strip `TRUNCATE`/`TRIGGER`/`REFERENCES`/`MAINTAIN` from anon/authenticated on all public tables
- Revoke `bookings_reference_seq` from client roles
- WhatsApp queue helpers: service_role EXECUTE only
- Default privileges: revoke tables/sequences/functions defaults from anon/authenticated for role `postgres` in `public`

### RLS

- All public base tables RLS enabled (baseline / health audit)
- FORCE RLS not required for MATCH

---

## 8. Verification method

1. Extract expected objects/privileges from migration SQL (not filenames alone).
2. Confirm linked project identity via `.temp` + MCP project APIs.
3. Execute read-only SELECTs via `npx supabase db query --linked` and MCP `execute_sql`.
4. Persist reusable SELECT pack in `docs/audits/sql/h01-5-production-catalog-verification-2026-07-14.sql`.
5. Classify expected vs actual without mutating.

Expression comparison for policies: N/A for Phase 1.11A storage denies because **zero policies present**.

---

## 9. Database identity evidence

| Field | Value |
|-------|-------|
| Database | `postgres` |
| User | `postgres` (login role via Management API) |
| Server | PostgreSQL 17.6 (aarch64) |
| Observed at | `2026-07-14 10:57:36+00` (first identity query) |
| `search_path` | `"$user", public, extensions` |
| Project | `shalean-platform` / `tchaye****xlvfu` / eu-west-3 |

---

## 10. Extension findings

| Extension | Schema | Class |
|-----------|--------|-------|
| `pg_cron` | `pg_catalog` | **MATCH** |
| `pg_net` | `public` | **MATCH** (expected location; hygiene note remains) |
| `pg_stat_statements` | `extensions` | **MATCH** |
| `pgcrypto` | `extensions` | **MATCH** |
| `plpgsql` | `pg_catalog` | **MATCH** (platform) |
| `supabase_vault` | `vault` | **MATCH** |
| `uuid-ossp` | `extensions` | **MATCH** |

No missing or unexpected extensions relative to baseline.

---

## 11. Schema findings

| Check | Actual | Class |
|-------|--------|-------|
| `public` USAGE for anon/auth | true / true | **MATCH** (API need) |
| `public` CREATE for anon/auth/public | false | **MATCH** |
| Key schemas present (`public`, `storage`, `auth`, `extensions`, `vault`, …) | present via catalog/status | **MATCH** |

---

## 12. Table findings

| Check | Actual | Class |
|-------|--------|-------|
| Public base tables | **175** | Compatible with baseline-era (~175) |
| Phase 1.11C service-only list | 118 listed; **117 present**; **1 missing** (`data_retention_settings`) | Missing object is **expected pre-1.11B** |
| Sample service-only tables (`system_logs`, `whatsapp_queue`, `payout_transfers`, …) | exist | **MATCH** existence |
| 5 tables already without anon SELECT | `conversion_*` (3), `dispatch_experiment_snapshots`, `dispatch_offer_exposure_dedupe` | **EXPECTED_DIFFERENCE** / partial prior revoke; not full 1.11C |

Critical objects (`bookings`, `cleaners`, `system_logs`, `notification_logs`, earnings/invoices) confirmed present via sample queries.

No material unexpected production-only base-table absence for Phase 1.11C’s list (other than `data_retention_settings`).

---

## 13. RLS findings

| Check | Expected (governed) | Actual | Class |
|-------|---------------------|--------|-------|
| Public tables RLS on | 175/175 | **175 on / 0 off** | **MATCH** |
| FORCE RLS | not required | 0 forced | **EXPECTED_DIFFERENCE** (F-SEC-007 soft) |
| `storage.objects` RLS | on | on | **MATCH** |
| Storage policies | 4 deny policies | **0 policies** | **RLS_DRIFT** / missing Phase 1.11A policies |

Row-level enablement matches baseline. Policy layer for storage does **not** match Phase 1.11A.

---

## 14. Policy findings

| Expected policy | Actual | Class |
|-----------------|--------|-------|
| `phase111a_deny_anon_auth_blog_media` | absent | **MISSING_EXPECTED_OBJECT** |
| `phase111a_deny_anon_auth_campaign_media` | absent | **MISSING_EXPECTED_OBJECT** |
| `phase111a_deny_anon_auth_booking_service_photos` | absent | **MISSING_EXPECTED_OBJECT** |
| `phase111a_deny_anon_auth_expense_receipts` | absent | **MISSING_EXPECTED_OBJECT** |

Storage buckets themselves (**blog-media**, **campaign-media**, **booking-service-photos**, **expense-receipts**) exist with expected public/private flags and size limits — **MATCH** for bucket metadata; **POLICY_DRIFT** for deny policies.

Admin view client SELECT already false (defense-in-depth partially present) but policies for storage remain empty — aligns with historical F-SEC-003.

---

## 15. Table privilege findings

| Check | Expected post-1.11C | Actual | Class |
|-------|---------------------|--------|-------|
| anon TRUNCATE on public tables | 0 | **176** | **PRIVILEGE_DRIFT** / `EXCESS_PRIVILEGE` |
| authenticated TRUNCATE | 0 | **174** | **PRIVILEGE_DRIFT** |
| anon TRIGGER / REFERENCES | 0 | **176** each | **PRIVILEGE_DRIFT** |
| Service-only tables: anon SELECT | false | **112 / 117 present tables true** | **PRIVILEGE_DRIFT** |
| Sample ops tables anon TRUNCATE | false | true | **PRIVILEGE_DRIFT** |
| service_role SELECT on samples | true | true | **MATCH** |

Dangerous privileges match Phase 1.11 health-audit magnitudes (anon truncate ~176) — production has **not** received `…130100`.

---

## 16. Schema and sequence privilege findings

| Check | Expected post-1.11C | Actual | Class |
|-------|---------------------|--------|-------|
| Schema CREATE denied to clients | denied | denied | **MATCH** |
| `bookings_reference_seq` client USAGE/SELECT | revoked | **anon/auth true** | **PRIVILEGE_DRIFT** |
| service_role sequence USAGE | true | true | **MATCH** |

---

## 17. Function security findings

| Function | Expected anon/auth | Actual anon/auth | Class |
|----------|--------------------|------------------|-------|
| `admin_mark_payout_paid` | false/false | **true/true** | **FUNCTION_SECURITY_DRIFT** |
| `invoke_nextjs_cron` | false/false | **true/true** | **FUNCTION_SECURITY_DRIFT** |
| `apply_cleaning_credit_transaction` | false/false | **true/true** | **FUNCTION_SECURITY_DRIFT** |
| `accept_dispatch_offer_atomic` | false/false | **true/true** | **FUNCTION_SECURITY_DRIFT** |
| `user_owns_booking` | false/true | **true/true** | **FUNCTION_SECURITY_DRIFT** (anon should be false) |
| `user_has_booking_with_cleaner` | false/true | **true/true** | **FUNCTION_SECURITY_DRIFT** |
| Marketing allowlist pair | true/true | true/true | **MATCH** (presence) |
| Public DEFINER with anon EXECUTE | allowlist-only | **79** | **FUNCTION_SECURITY_DRIFT** |
| `get_pending_whatsapp_jobs` / queue metrics | service only | anon+auth true | **FUNCTION_SECURITY_DRIFT** |
| `prune_notification_logs(int,int)` | exists | **absent** | **MISSING_EXPECTED_OBJECT** |
| `prune_system_logs(int,int)` | exists | **absent** | **MISSING_EXPECTED_OBJECT** |
| `prune_system_logs(int)` | exists (baseline) | present; anon_exec true | Present + **FUNCTION_SECURITY_DRIFT** |

Function bodies / `search_path` were not altered in this phase; Phase 1.11A explicitly does not change bodies. Pre-existing DEFINER + empty/mutable path risks from the health audit remain open until separate hardening beyond EXECUTE grants.

---

## 18. Default privilege findings

`pg_default_acl` for role `postgres` in `public` still grants **tables/sequences/functions ALL (incl. TRUNCATE/TRIGGER/REFERENCES/MAINTAIN)** to roles:

- `anon`
- `authenticated`
- `service_role`
- `postgres`

| Expected post-1.11C | Actual | Class |
|---------------------|--------|-------|
| No table/sequence/function defaults to anon/auth | Defaults to anon/auth still present | **DEFAULT_PRIVILEGE_DRIFT** |
| service_role retained | present | **MATCH** (desired retain) |

---

## 19. View findings

| View set | Expected | Actual | Class |
|----------|----------|--------|-------|
| 12 `admin_*` referral/economics views | `security_invoker=true` | **all `false`** | **FUNCTION_SECURITY_DRIFT** / view security drift |
| Same views client SELECT | false | false | **MATCH** |
| Same views service SELECT | true | true | **MATCH** |
| `job_offers` | invoker true (baseline) | true | **MATCH** |

Client SELECT already revoked (good), but invoker mode from Phase 1.11B is absent.

---

## 20. Trigger findings

No Phase 1.11 migration alters trigger definitions. Security-relevant booking/reference triggers were not re-inventoried exhaustively in H01.5; no evidence of trigger-layer unexpected drift was required to choose H02 strategy. **INSUFFICIENT_EVIDENCE** for full trigger matrix; not blocking given privilege findings.

---

## 21. Constraint and index findings

| Check | Actual | Class |
|-------|--------|-------|
| Audited CASCADE FKs exist (sample) | present | **MATCH** existence |
| Phase 1.11B AUDIT comments | **empty** on sampled constraints | **MISSING_EXPECTED_OBJECT** (comment-only) |
| Critical tables present | yes | **MATCH** |

No unexpected constraint breakage detected; comment metadata from `…120400` not applied.

---

## 22. Expected-versus-actual matrix

| Object type | Object | Expected state | Actual state | Evidence query | Classification | Severity | Notes |
| ----------- | ------ | -------------- | ------------ | -------------- | -------------- | -------- | ----- |
| Metadata | Active 9 migration versions | Remote applied | Remote absent; 12 remote-only archaeology | `migration list --linked` | `METADATA_ONLY_DRIFT` | Critical for tooling | Confirmed H01 |
| Extension | Baseline set | Installed | Installed | `pg_extension` | `MATCH` | — | |
| Table | Public RLS | All enabled | 175/175 | `pg_class.relrowsecurity` | `MATCH` | — | |
| Table | `data_retention_settings` | Present post-1.11B | Absent | `information_schema.tables` | `MISSING_EXPECTED_OBJECT` | Medium (ops) | Expected until 1.11B apply |
| Policy | 4 storage deny policies | Present | 0 | `pg_policies` | `POLICY_DRIFT` | High | F-SEC-003 live |
| Function | Privileged DEFINER EXECUTE | Locked | anon/auth still true | `has_function_privilege` | `FUNCTION_SECURITY_DRIFT` | Critical | F-SEC-001/002 live |
| Function | DEFINER anon surface | Allowlist only | 79 | count query | `FUNCTION_SECURITY_DRIFT` | Critical | |
| Privilege | Dangerous client table privs | Stripped | ~176 TRUNCATE etc. | `role_table_grants` | `PRIVILEGE_DRIFT` | High | F-SEC-005 live |
| Privilege | Service-only client grants | Zero | 112/117 still SELECT | table privilege matrix | `PRIVILEGE_DRIFT` | High | |
| Privilege | `bookings_reference_seq` | Client revoked | Client holds USAGE/SELECT | `has_sequence_privilege` | `PRIVILEGE_DRIFT` | Medium | |
| Default ACL | postgres→anon/auth | Revoked | Still ALL | `pg_default_acl` | `DEFAULT_PRIVILEGE_DRIFT` | High | Amplifier open |
| View | admin_* security_invoker | true | false | `pg_options_to_table` | `FUNCTION_SECURITY_DRIFT` | Medium | Client SELECT already false |
| Constraint comment | AUDIT Phase 1.11B | Present | Absent | `obj_description` | `MISSING_EXPECTED_OBJECT` | Low | Docs only |
| Bucket | 4 storage buckets | Present | Present | `storage.buckets` | `MATCH` | — | |
| Index/extra | Unrelated extras | — | not flagged | — | `EXPECTED_DIFFERENCE` | — | Not treated as security failure |

---

## 23. Unexpected production objects or privileges

- **No unexpected extensions.**
- **No missing critical baseline tables** among sampled inventory.
- **5 service-only tables without anon SELECT** already (conversion/dispatch subset) — slight prior divergence; still not Phase 1.11C complete.
- **Open privilege surface** is expected relative to **baseline dump**, unexpected relative to **governed post-1.11 Git target**.

No evidence of production-only mystery objects blocking mapping of Phase 1.11 effects.

---

## 24. Evidence gaps

1. Full trigger inventory not recollected.
2. Full policy inventory for all 175 tables not differential-diffed against baseline policy dump (not required — Phase 1.11 primarily grants/views/storage).
3. Staging/dev projects not catalog-checked (out of scope; linked target is production `shalean-platform`).
4. Exact checksum of every baseline column not re-diffed (prioritized Phase 1.11 security objects).
5. `SECTION_12` retention row contents deferred until table exists.
6. Some CLI `db query` sessions hung on login; MCP SELECT path used for those cases (same project).

---

## 25. Security impact

Production API surface remains at the **Critical** posture described in Phase 1.11 health audit:

- Privileged SECURITY DEFINER RPCs callable with the anon key
- `invoke_nextjs_cron` callable by anon
- Storage RLS with zero policies
- Broad TRUNCATE/TRIGGER/REFERENCES grants to client roles (RLS-dependent)
- Default privilege amplifier still opens future objects to anon/auth

This is **not** a metadata-only problem. Metadata repair alone would **not** harden production.

---

## 26. Drift classification

| Domain | Status | Confidence |
|--------|--------|------------|
| Metadata drift | **CONFIRMED** (unchanged from H01) | High |
| Schema structural drift (baseline objects) | **Not material** / compatible | High |
| RLS enablement drift | **None material** | High |
| Policy drift (storage 1.11A) | **CONFIRMED** | High |
| Privilege drift (1.11C) | **CONFIRMED** | High |
| Default privilege drift (1.11C) | **CONFIRMED** | High |
| Function security drift (1.11A) | **CONFIRMED** | High |
| View security_invoker drift (1.11B) | **CONFIRMED** | High |
| Evidence confidence (live catalog) | **High** for Phase 1.11 effects | High |

H01.5-G mapping: **Outcome B — Partial Security Drift** (pre-1.11 production vs post-1.11 Git; structure intact; remediation path = apply 1.11 after safe metadata cutover).

Formal phase status vs governed target: **FAIL**.

---

## 27. Recommended H02 strategy

```text
H02 STRATEGY: CONTROLLED SCHEMA REMEDIATION
THEN METADATA RECONCILIATION
```

Interpretation:

1. **Do not** execute the production baseline against live data.
2. **Do not** choose metadata-only reconciliation as the sole action — Phase 1.11 effects are materially absent.
3. Approved H02 sequence (planning reference only; **not executed here**): backup → metadata repair (baseline applied + archaeology reverted) → apply Phase 1.11A–C forward → run verification SQL packages → align `migration list`.
4. Missing effects list (apply via Phase 1.11 migrations, not baseline):
   - 1.11A DEFINER EXECUTE lockdown
   - 1.11A storage deny policies
   - 1.11B admin view `security_invoker`
   - 1.11B retention table + prune signatures + FK comments
   - 1.11C service-only revokes, dangerous privilege strip, sequence revoke, WhatsApp helper lockdown, default privilege hardening

---

## 28. Required H02 prerequisites

1. Human acceptance of this H01.5 report (Outcome B / FAIL vs governed target).
2. Confirm production project remains `tchaye****xlvfu` / `shalean-platform`.
3. PITR / backup confirmation for production.
4. Dual approval for production schema ACL changes (engineering lead + ops/product).
5. Prefer non-production rehearsal of repair + 1.11 apply when available.
6. Keep baseline DDL off production forever.
7. Post-apply: run `phase-1-11a-b-verification.sql` / `phase-1-11c-verification.sql` / H01.5 SQL pack via approved path.
8. Explicit deployment ticket listing every `migration repair` version decision (H01 plan appendix).

---

## 29. Commands executed

| Command / action | Class |
|------------------|-------|
| `git status` / `branch` / `rev-parse` / `log` | local read-only |
| `npm run db:migrations:validate` | local read-only |
| Inventory of `supabase/migrations`, legacy, docs | local read-only |
| Read `supabase/.temp/project-ref`, `linked-project.json`, `config.toml` | local read-only |
| `npx supabase migration list --linked` | remote read-only |
| `npx supabase status` | local inspection |
| `npx supabase db query --help` | help only |
| `npx supabase db query --linked "<SELECT…>"` (identity, extensions, views, storage, dangerous priv counts, …) | remote read-only |
| MCP `list_projects`, `get_project` | remote read-only / inspection |
| MCP `execute_sql` with SELECT-only catalog queries | remote read-only |
| Static creation of docs + verification SQL in repo | documentation only |

---

## 30. Commands explicitly not executed

Confirmed **not** run:

- schema / data / grant / revoke changes
- `supabase db push`
- `supabase migration repair` / `migration up`
- baseline or Phase 1.11 SQL apply
- project relink
- secret rotation / config writes
- commits or pushes
- mutating MCP tools (`apply_migration`, etc.)

---

## 31. H01.5 exit checklist

| Criterion | Met? |
|-----------|:----:|
| Repository safety check | Yes |
| Evidence source inventory | Yes |
| Expected state extracted from SQL | Yes |
| Linked production identity confirmed | Yes |
| Read-only verification SQL created | Yes |
| Live catalog evidence collected | Yes |
| Expected-vs-actual matrix | Yes |
| Security outcome + H02 strategy chosen | Yes |
| H01 docs addendum / cross-ref | Yes |
| Risk register updated | Yes |
| No remote mutation | Yes |
| H02 not started | Yes |

**H01.5 verdict:** **FAIL** (material Phase 1.11 privilege/security drift confirmed) — **H02 pathway:** controlled schema remediation then metadata reconciliation.
