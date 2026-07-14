# Risk Register additions — Phase 1.11C privileges

| Risk ID | Severity | Likelihood | Impact | Status | Mitigation |
|---------|----------|------------|--------|--------|------------|
| RISK-DB-009 | High | High (pre-1.11C) | Catastrophic if RLS fails + TRUNCATE | Mitigated by prepared migrations | Apply 1.11C after approval |
| RISK-DB-010 | Medium | Low | App 42501 on missed table | Open until H02B smoke (no cloud staging soak) | Compatibility checklist; spot GRANT restore |
| RISK-DB-011 | Low | Medium | Silent missing grants on new tables | Open | Document in migration governance; CI note |

---

## H01.5 cross-reference updates (2026-07-14)

Live production catalog verification (`docs/audits/h01-5-production-catalog-and-privilege-verification-2026-07-14.md`) **confirmed** that RISK-DB-009 remains **Open on production** (TRUNCATE/TRIGGER/REFERENCES still granted to client roles; counts ≈176/174). Prepared 1.11C migrations mitigate only after gated apply — status is **not** production-mitigated yet.

Do not invent parallel IDs for the same TRUNCATE surface; use RISK-DB-009 + H01.5-R02 below.

---

## H01.5 risk entries

| ID | Title | Category | Severity | Likelihood | Evidence | Impact | Mitigation | Owner | Status | Deployment-gate? |
|----|-------|----------|----------|------------|----------|--------|------------|-------|--------|------------------|
| H01.5-R01 | Missing Phase 1.11 privilege hardening on production | Privilege / security | Critical | Certain | Live: DEFINER anon EXECUTE=79; service-only tables still grant client SELECT (112/117); 1.11 versions absent from remote metadata | Public API can attempt money/ops RPCs; defense-in-depth grants remain broad | Gated apply of Phase 1.11A–C after metadata cutover; verify with H01.5 + phase-1-11*-verification.sql | Engineering (DB) | Open | **Yes** |
| H01.5-R02 | Dangerous client table privileges (TRUNCATE/TRIGGER/REFERENCES) | Privilege | High | Certain | Live `role_table_grants`: anon TRUNCATE=176, auth TRUNCATE=174 (cross-ref RISK-DB-009) | RLS bug → catastrophic wipe/mutation path | Apply `…130100`; re-count dangerous privs = 0 | Engineering (DB) | Open | **Yes** |
| H01.5-R03 | Unsafe default privileges amplifier | Default privileges | High | Certain | Live `pg_default_acl`: postgres→anon/authenticated ALL on tables/sequences/functions in `public` | Every future object auto-granted to API roles | Apply `…130200`; re-inspect `pg_default_acl` | Engineering (DB) | Open | **Yes** |
| H01.5-R04 | Storage RLS with zero policies | RLS / policies | High | Certain | Live: `storage.objects`/`buckets` RLS on, policy_count=0; Phase 1.11A deny policies absent | Ambiguous Storage API access; private bucket misconfig risk | Apply `…120100`; confirm four `phase111a_deny_*` policies | Engineering (DB) | Open | **Yes** |
| H01.5-R05 | Unexpected / missing expected storage deny policies | Policy drift | High | Certain | Expected four deny policies; actual none | Same as H01.5-R04 | Same as H01.5-R04 | Engineering (DB) | Open | **Yes** |
| H01.5-R06 | Unsafe function execution grants on DEFINER RPCs | Function security | Critical | Certain | Live: `admin_mark_payout_paid`, `invoke_nextjs_cron`, `apply_cleaning_credit_transaction`, etc. anon_exec=true | Unauthenticated money/ops/cron invocation attempts | Apply `…120000`; verify allowlist-only anon EXECUTE | Engineering (DB) | Open | **Yes** |
| H01.5-R07 | SECURITY DEFINER body/search_path residual risk | Function security | High | High | Phase 1.11A does not alter bodies; health audit F-SEC-001 body findings still relevant | Even after EXECUTE lockdown, compromised elevated roles retain DEFINER risk | Post-1.11 track DEBT for in-function auth / search_path; do not treat EXECUTE revoke as complete DEFINER remediation | Engineering (DB) | Open (accepted post-1.11 residual) | Soft / follow-on |
| H01.5-R08 | Baseline vs governed privilege mismatch (not structural mismatch) | Baseline / schema compatibility | Medium | Certain | Structure matches baseline era; privileges match pre-1.11, not Git post-1.11 | Wrong H02 choice (metadata-only) would leave Critical findings live | Use controlled remediation then metadata repair (H01.5 Outcome B) | Engineering lead | Open | **Yes** |
| H01.5-R09 | Production-only objects not in Git | Schema drift | Low | Low (this pass) | Service-only list 117/118 present; only missing is expected 1.11B table; no unexplained blocker objects found | Future unknown dashboard DDL still possible | Spot-check critical objects before each H02 env; optional full dump diff later | Engineering (DB) | Watch | Soft |
| H01.5-R10 | Insufficient catalog evidence (residual) | Evidence | Low | Low | Triggers / full policy differential not exhaustive; retention row query deferred | Minor blind spots only; Phase 1.11 decision confidence remains high | Optional expand trigger/policy inventory in H02 rehearsal | Engineering (DB) | Accepted for H01.5 | No |
| H01.5-R11 | Metadata repair risk | Migration history | Critical | High if ungated | Disjoint remote/local versions (H01); repair + 1.11 apply required | Blind `db push` / wrong repair status could attempt baseline replay or double-apply | Follow H01 plan gates; backups; never execute baseline DDL on prod; rehearsal preferred | Engineering lead + ops | Open | **Yes** |
| H01.5-R12 | Admin views missing security_invoker | View security | Medium | Certain | Live: 12 `admin_*` views security_invoker=false; client SELECT already false | Low current exploitability if SELECT stays revoked; bypass risk if grants regress | Apply `…120200` | Engineering (DB) | Open | **Yes** |
| H01.5-R13 | Missing RLS enablement | RLS | Info | Unlikely | Live: 0 public tables with RLS disabled | N/A this pass | Maintain “RLS on for all public tables” gate in verify SQL | Engineering (DB) | Not observed | Soft |

---

## H02A cross-reference updates (2026-07-14)

Local Model B rehearsal (`docs/audits/h02a-non-production-rehearsal-verification-2026-07-14.md`) proved:

- Preserving the 12 remote-only versions **blocks** standard `db push` (CLI demands revert).
- Marking baseline `applied` without SQL **excludes** baseline from dry-run push sets.
- Phase 1.11A–C re-apply is idempotent enough for controlled push.
- `--include-all` is hazardous if baseline is pending.

Production still carries open H01.5 privilege risks until H02B executes.

Progress audit (2026-07-14) **did not** authorize H02B. Later identity/relink verification and the operational package reconfirmed production link + history. `--include-all` remains prohibited. Baseline SQL must not execute on production. No cloud staging soak occurred. Application smoke remains incomplete. **Do not close Phase 1.11 / RISK-DB-009 production remediation before H02C succeeds.**

### H02A risk entries

| ID | Title | Category | Severity | Likelihood | Evidence | Impact | Mitigation | Owner | Status | Deployment-gate? |
|----|-------|----------|----------|------------|----------|--------|------------|-------|--------|------------------|
| H02A-R01 | Baseline pending during push / `--include-all` foot-gun | Migration history | Critical | High if ungated | Local: dry-run lists baseline when not marked applied; include-all required if later versions already applied | Catastrophic baseline replay on prod | Mandatory dry-run = exactly 8 Phase 1.11; **never** `--include-all` | Engineering lead | Open until H02B | **Yes** |
| H02A-R02 | Model A (preserve archaeology) leaves tooling blocked | Migration history | High | Certain | Local: `Remote migration versions not found in local migrations directory` | Operators invent unsafe workarounds | Use Model B only (revert 12) | Engineering (DB) | Mitigated in plan | **Yes** |
| H02A-R03 | No approved cloud staging clone | Process | Medium | Certain | Only local Docker approved; `qpqn****ejrb` rejected (26 users) | First production apply lacks cloud soak | Dual approval + PITR + canary smoke; Go/No-Go checklist | Engineering lead + ops | Open | **Yes** |
| H02A-R04 | Out-of-order staged A/B/C metadata trick fails | Tooling | Medium | Certain | Local staged attempt required `--include-all` | False sense of phase isolation | Single eight-file push; verify A/B/C logically after | Engineering (DB) | Accepted | Soft |
| H02A-R05 | Incomplete app-role smoke on local | Verification | Medium | Certain | 0 local users; REST-level smoke only | Missed functional 42501 regressions | Expand smoke in H02B window; checklist smoke gates | Engineering + product | Open | **Yes** |
| H02A-R06 | H01.5 Critical privileges remain on production until H02B | Privilege / security | Critical | Certain | Unchanged production posture (H01.5); H02B still NO-GO | Public API surface remains excessive | Execute approved H02B runbook only after Go/No-Go = GO; close only after H02C | Engineering (DB) | Open | **Yes** |
| H02A-R07 | Linked CLI identity ambiguity / history drift (progress audit) | Environment identity | Critical | Observed (historical) | Relink + Go/No-Go + ops package: linked `tchaye****xlvfu`, `users=167`, `bookings=432`, history matches H01 shape; previews `hborcp`/`gfvdic` not linked | Wrong-target mutation risk if link regresses | Re-proof identity at T-20; hard stop on mismatch | Engineering lead + ops | **Mitigated** (preview/wrong-link risk); re-verify before execute | **Yes** |

---

## H02B operational package updates (2026-07-14)

Operational prerequisites package prepared; H02B execution **not** authorized. Technical gates PASS. PITR explicitly disabled per CLI. Physical backups exist but are **not** equivalent to PITR. Shalean will **not** upgrade compute or purchase PITR at this time. A formal **backup-only recovery exception** model is documented and remains **PENDING** dual approval. Human-control gates remain open.

| ID | Title | Category | Severity | Likelihood | Evidence | Impact | Mitigation | Owner | Status | Deployment-gate? |
|----|-------|----------|----------|------------|----------|--------|------------|-------|--------|------------------|
| H02B-R01 | Production Phase 1.11 privilege remediation still pending | Privilege / security | Critical | Certain | H01.5 live posture unchanged; Go/No-Go = NO-GO | Critical client privileges remain until successful H02B + H02C | Complete operational gates → Model B → H02C verify | Engineering (DB) | Open — **do not close before H02C** | **Yes** |
| H02B-R02 | PITR not enabled on production | Recovery | Critical | Certain | `npx supabase backups list` 2026-07-14T16:23:00+02:00 → `pitr_enabled: false`; `walg_enabled: true`; latest physical backup `1108905187` @ `2026-07-14T00:37:50.739Z` | Limited fine-grained recovery; physical restore only as last resort | Formal backup-only recovery exception (dual approval PENDING); enable PITR after future compute upgrade (DEBT-DB-015) | Ops / Recovery | Open — **REC-01 EXCEPTION REQUIRED**; not accepted until dual approval | **Yes** |
| H02B-R03 | Operational human-control gaps | Process / governance | High | Certain | Approvals, owners, window, freeze, smoke fixtures, acknowledgements all PENDING | Ungoverned or under-staffed execution | Complete change-control, window plan, smoke matrix, acknowledgements | Engineering lead + ops | Open — **blocks H02B** | **Yes** |
| H02B-R04 | Preview / sibling wrong-target residual | Environment identity | Medium | Low after reconfirm | Identity reconfirmed; previews exist as children but not linked | Relink regression still possible | T-20 identity re-proof; reject `qpqn`/`hborcp`/`gfvdic` | Engineering (DB) | Mitigated currently; watch at window | **Yes** |
| H02B-R05 | Production database operates without Point-in-Time Recovery | Infrastructure / Recovery | High | Medium | PITR disabled; compute below Small minimum; decision not to upgrade/purchase PITR now; eight COMPLETED physical backups; exception model in change-control | Inability to restore to an arbitrary second; possible loss of changes since most recent usable backup; longer recovery time than PITR | Daily completed physical backups; migration governance; maintenance windows; dual approval; named recovery authority; smoke tests; formal backup-only exception (PENDING approvals) | Ops / Engineering lead | **Open — Accepted only for H02B after dual approval** (approvals do not yet exist) | **Yes** |

### H02B-R05 review triggers

- Production compute upgrade
- Major database release / migration
- Material production growth / transaction-volume increase
- Production incident involving data loss or operator error
- Annual infrastructure review

Do **not** mark H02B-R05 accepted until Engineering owner, Business owner, Approver 1, and Approver 2 record explicit approvals with timestamps and evidence.

