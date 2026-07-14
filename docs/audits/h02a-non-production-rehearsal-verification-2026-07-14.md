# H02A — Non-Production Rehearsal Verification Report

**Date:** 2026-07-14  
**Phase:** H02A  
**Companion plan:** `docs/plans/h02a-controlled-security-remediation-rehearsal-plan-2026-07-14.md`  
**Production runbook:** `docs/runbooks/h02b-production-security-remediation-runbook-2026-07-14.md`  
**Verification SQL:** `docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql`

---

## 1. H02A status

```text
COMPLETE — APPROVED
```

Local Model B cutover + Phase 1.11 re-apply succeeded. Cloud staging soak **did not occur** (none approved). Production was **not** mutated. Production PITR and dual approval remain **H02B** prerequisites tracked in `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md`.

Production remains **pre–Phase 1.11** until H02B succeeds. Application smoke coverage remains **incomplete** (see §12).

**Repository note (as recorded during H02A):** branch `main` @ approved SHA. Later progress audits must re-verify branch/`origin/main`/working tree independently before H02B — tip equality alone on another local branch name is not sufficient.

---

## 2. Repository state

| Check | Result |
|-------|--------|
| Branch | `main` |
| HEAD | `99526d72fca841fdc189eaf33720655a564675b0` |
| `origin/main` | identical |
| Working tree | Dirty with H01/H01.5/H02A documentation only (no migration edits) |
| Active migrations | **9** |
| `npm run db:migrations:validate` | **PASS** |
| H01 / H01.5 reports | Present |

---

## 3. Non-production target identity

```text
APPROVED NON-PRODUCTION REHEARSAL TARGET = Local Supabase Docker
```

| Proof | Evidence |
|-------|----------|
| Not production | Mutations used `--local` only; production ref `tchaye****xlvfu` untouched |
| Different identity | Docker `supabase_db_shalean-platform`, Postgres on `127.0.0.1:54322` |
| No live customer data | `auth.users=0`, `bookings=0` |
| Approved for corrective testing | H01 plan §7 endorses `--local` repair dry-run; classified explicitly before mutation |
| Reset capability | `supabase db reset` / metadata re-repair |

**Rejected:** `shalean project` (`qpqn****ejrb`) — 26 auth users; different schema/history; not approved.

---

## 4. Before migration list

Initial local (aligned governed chain — both local and DB):

`20260714010000` … `20260714130200` (9 versions applied).

After simulation fixture (matches production shape):

| Side | Versions |
|------|----------|
| Remote-only (12) | `20260421`, `20260511172349` … `20260512115242`, `20261053`, `20261071` |
| Local-only (9) | Full active chain pending |

---

## 5. Before catalog state

Local was already post–Phase 1.11 (from prior local apply):

- RLS on all sampled public tables  
- 4 `phase111a_deny_*` storage policies  
- Dangerous TRUNCATE counts = 0  
- DEFINER anon EXECUTE count = 2 (marketing allowlist)  
- `data_retention_settings` present  
- Admin views `security_invoker=true`

Therefore Phase 1.11 push rehearsed **idempotent re-application** after metadata cutover, not first hardening of a pre-1.11 catalog. Production remains pre-1.11 per H01.5.

---

## 6. Metadata repair commands executed

| # | Command (abridged) | Environment | Purpose |
|---|--------------------|-------------|---------|
| F0 | `migration repair --status reverted --local` × 9 active | local | Clear local history to simulate pending chain |
| F1 | Direct `INSERT` into `schema_migrations` for 12 archaeology | local **fixture only** | Seed production-shaped remote-only rows (CLI cannot `repair --status applied` without local files) |
| A1 | `migration repair --status applied --local 20260714010000` | local | Model A test |
| B1 | `migration repair --status reverted --local` × 12 archaeology | local | Model B |
| S1 | Temporary `repair --status applied` on B+C | local | Staged A attempt (failed pattern) |
| S2 | Revert those temporary marks | local | Restore eight pending |
| R1 | Accidental `reverted` then `applied` on baseline | local | Recovery test |

**Not executed:** any `--linked` repair/push.

---

## 7. Migration list after each repair

| Step | Result |
|------|--------|
| After F0 | 9 local-only pending |
| After F1 fixture | Matches production disjoint list |
| After A1 (baseline applied, archaeology kept) | Baseline aligned; 12 remote-only remain; 8 Phase 1.11 local-only |
| After B1 (archaeology reverted) | Baseline applied; exactly 8 Phase 1.11 pending |
| After full push | All 9 active versions aligned local/remote |
| After recovery R1 | Baseline pending mid-test → restored applied; DB up to date |

---

## 8. Phase 1.11A result

| Check | Result |
|-------|--------|
| Isolated A-only push via out-of-order B+C marks | **Blocked** by CLI (`Found local migration files to be inserted…` needs `--include-all`) |
| A included in single eight-file push | **Applied** (`…120000`, `…120100`) |
| Storage deny policies | **4/4** |
| DEFINER anon surface | **2** (allowlist) |
| Baseline DDL | **Not executed** |

**Production implication:** apply A as part of the single eight-migration push; verify A effects from the post-push catalog pack (do not rely on out-of-order staging).

---

## 9. Phase 1.11B result

| Check | Result |
|-------|--------|
| `data_retention_settings` | Present (NOTICE already-exists on re-apply) |
| `prune_notification_logs(p_retention_days, p_batch_size)` | Present |
| `prune_system_logs` 2-arg | Present |
| Admin views invoker | All 12 `true`; client SELECT false; service SELECT true |
| FK AUDIT comments | Present on samples |

---

## 10. Phase 1.11C result

| Check | Result |
|-------|--------|
| Dangerous priv counts | All **0** |
| `bookings_reference_seq` client USAGE/SELECT | **false** |
| Default ACL postgres→anon/authenticated | **0 rows** |
| WhatsApp helpers client EXECUTE | **false** |
| service_role retained | Confirmed on samples |

---

## 11. Final catalog verification

`h02a-post-remediation-verification-2026-07-14.sql` via Docker `psql` — **PASS** against pass criteria in file footer (after fixing prune identity-argument match for named parameters).

---

## 12. Application smoke tests

Local demo keys only (not production credentials):

| Test | Result |
|------|--------|
| service_role `bookings` GET | 200 |
| anon `bookings` GET (RLS) | 200 (empty under RLS) |
| service_role `system_logs` GET | 200 |
| anon `system_logs` GET | 401 denied |
| service_role storage buckets | 200 |
| anon `public_review_banner_stats` RPC | 200 |
| anon `invoke_nextjs_cron` | 404 denied (expected PostgREST hide) |
| anon `admin_mark_payout_paid` | 404 denied |

**Not fully exercised (no seeded users / no Paystack / no cleaner fixtures):** customer auth login, full booking write path, payment initialize with test charge, admin dashboard UI, cleaner earnings UI, cron HTTP invocation end-to-end, notification sends. These remain **H02B prerequisites** for a seeded non-prod or careful production canary, documented as open.

---

## 13. Recovery test

| Scenario | Result |
|----------|--------|
| Accidental baseline `reverted` while 1.11 applied | Dry-run/path demands `--include-all` for baseline — **danger signal** |
| Re-`repair --status applied` baseline | Restored; dry-run **Local database is up to date** |
| Prefer roll-forward for ACL defects | Documented (not inventing rollback migrations) |

---

## 14. Differences from expected outcome

1. **Model A failed CLI push** — stronger than anticipated; Model B mandatory.  
2. **Staged A→B→C via temporary applied marks incompatible** with default push — production uses single eight-file push.  
3. **CLI `repair --status applied` cannot invent versions without local files** — fixture insert used only for local simulation; production already has archaeology rows so `reverted` repair works.  
4. Local catalog started post-1.11 — production first apply will show larger privilege deltas (per H01.5).

---

## 15. Risks discovered

- `--include-all` is a foot-gun if baseline is pending.  
- Model A is a dead end for standard tooling.  
- No approved cloud staging clone with production-like history.  
- Application smoke incomplete without seeded identities.

---

## 16. Files changed

Created/updated documentation and verification SQL only — **no migration file changes**.

---

## 17. Commands executed

| Class | Examples |
|-------|----------|
| local read-only | `git *`, `db:migrations:validate`, `migration list --local`, catalog SELECTs |
| remote read-only | `migration list --linked`, MCP `list_projects` / `get_project` / SELECT on both projects |
| non-production metadata mutation | `migration repair --local …` |
| non-production schema mutation | `db push --local --yes` (eight Phase 1.11 files); fixture INSERT for archaeology simulation |
| verification | Docker `psql` verify SQL; REST smoke |
| test | validate script; smoke checks |

---

## 18. Commands not executed

Confirmed **not** run against production / linked:

- `migration repair --linked`  
- `db push --linked`  
- `migration up --linked`  
- `db reset` (linked or production)  
- baseline SQL execution on any populated environment  
- production GRANT/REVOKE/ALTER/…  
- project relink / secret changes  
- git commit / push  

---

## 19. Production recommendation

```text
RECOMMENDED MODEL: Model B
BASELINE: MARK APPLIED WITHOUT EXECUTING SQL
APPLY: single dry-run-gated db push of eight Phase 1.11 migrations
--include-all: PROHIBITED
CLOUD STAGING SOAK: NOT PERFORMED
APP SMOKE: INCOMPLETE UNTIL H02B FIXTURES/OWNERS ASSIGNED
PRODUCTION: REMAINS PRE-PHASE 1.11 UNTIL H02B SUCCEEDS
H02B: GO/NO-GO CHECKLIST REQUIRED — DO NOT EXECUTE UNTIL GO
```

Prerequisites: proven production identity, PITR confirm, dual approval, maintenance window, dry-run match, post-apply verify SQL, expanded smoke as feasible. See `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md` and `docs/audits/h02-program-progress-status-2026-07-14.md`.

---

## 20. H02A exit checklist

| Criterion | Met? |
|-----------|:----:|
| Repo safety recorded | Yes |
| Active + remote-only matrices | Yes |
| ≥2 metadata models compared | Yes |
| Non-prod identity proven / rejects documented | Yes |
| Model B rehearsed with dry-run proof | Yes |
| Phase 1.11 applied locally post-cutover | Yes |
| Catalog verification PASS | Yes |
| Recovery tested | Yes |
| Production runbook written | Yes |
| Stop conditions documented | Yes |
| No production mutation | Yes |
| H02B not started | Yes |
