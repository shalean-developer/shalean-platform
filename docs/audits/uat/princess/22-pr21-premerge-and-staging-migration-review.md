# PRINCESS-UAT-PRE-REVIEW-AND-STAGING-MIGRATION — PR #21 Pre-Merge + Staging Migration Review

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-PRE-REVIEW-AND-STAGING-MIGRATION |
| **PR** | [#21](https://github.com/shalean-developer/shalean-platform/pull/21) |
| **Branch** | `fix/princess-pre-notification-cron-reliability` |
| **Base** | `staging` |
| **Commit** | `f3246e3ebe7db0eef4cb0cd495eb6e53e5a39d68` |
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` |
| **Production Supabase** | `tchayecuvzssixyxlvfu` (**unchanged**) |
| **Migration** | `20260716120000_princess_pre_push_notification_channel.sql` |
| **SHA256** | Recorded in apply evidence (migration file checksum; not inlined here) |
| **Review date (UTC)** | 2026-07-16 |

---

# Executive Decision

| Decision | Result |
|----------|--------|
| **Staging migration** | **PASS — STAGING MIGRATION 20260716120000 APPLIED AND VERIFIED** |
| **PR #21 merge** | **NO-GO — PR #21 REQUIRES ADDITIONAL WORK** |

Migration is safe and verified on staging only. PR code scope, outbound gating, retry/dead-letter bounds, and local/CI test gates are sound. Merge is blocked by a failing Vercel GitHub check that resolves to Hobby cron frequency documentation for schedules more frequent than daily (`*/5`), which risks a failed staging deploy after merge until plan/`vercel.json` is resolved.

---

# PR Scope Review

| Check | Result |
|-------|--------|
| Targets `staging` | **PASS** (`baseRefName=staging`) |
| PR E notification/cron reliability only | **PASS** |
| No pricing / payment / refund / payout / auth changes | **PASS** |
| No production environment changes | **PASS** |
| Dependency / lockfile changes | **PASS** — only `apps/web/package.json` `test:critical` script extended to include PR E tests (justified) |
| Does not enable SMS / WhatsApp | **PASS** — SMS still `SMS_OUTBOUND_ENABLED`; WhatsApp customer retry still blocked |
| Does not bypass staging email allowlists | **PASS** — admin retry uses `safeResendSend` |
| Push gated by `PUSH_OUTBOUND_ENABLED` in non-prod | **PASS** (`expoPushAdapter.ts`) |

### Surface review

| Area | Assessment |
|------|------------|
| `safeResendSend` | Admin notification retry path uses allowlist-safe sender; outbound_blocked handled |
| Cleaner `/api/cleaner/devices` | JWT-bound `authUserId`; strips body user/cleaner ids; upsert/delete only |
| Expo dispatch | Idempotency claim → adapter send → log; invalid token cleanup; sanitize title/body/data |
| Memory/test adapters | Local Expo + email adapters; no live outbound in tests |
| Retry/backoff | Max 5; exponential 60s…60m + jitter; non-transient → dead-letter |
| Dead-letter | Terminal payload + operator view helper (masked recipient) |
| Operator visibility | `cronRunHealth` statuses + lifecycle admin fields |
| Booking-lifecycle cron | `verifyCronSecret`, lock lease 1200s, `MAX_JOBS=50`, `MAX_COMPLETE=80`, success/error `cron_runs` |
| `vercel.json` | Adds `*/5 * * * *` for `/api/cron/booking-lifecycle` |

Files in PR (39): notification/push/cron code + docs/evidence + one migration + `package.json` test script + `vercel.json`. No unrelated domain churn.

---

# Migration SQL Review

File: `supabase/migrations/20260716120000_princess_pre_push_notification_channel.sql` (26 lines / 1423 bytes).

**Exact changes:**

1. Replace `notification_logs.channel` CHECK → add `push` (keep email/whatsapp/sms).
2. Replace `notification_logs.provider` CHECK → add `expo` (keep resend/twilio/meta).
3. Replace `notification_idempotency_claims.channel` CHECK → add `push` (keep email/sms/in_app).
4. Comment on channel constraint.

| Risk | Finding |
|------|---------|
| CHECK replacement | Expand-only; existing values remain valid |
| Enum/domain | None (text CHECKs only) |
| New indexes / unique constraints | **None** (idempotency uniques already exist) |
| Backfill / defaults | None |
| Table rewrites | None (metadata constraint swap) |
| Locking | Brief ACCESS EXCLUSIVE on constraint drop/add; tables small on staging |
| Duplicate-data failure | N/A for new unique; existing uniques unchanged |
| NULL compatibility | Channels/providers are NOT NULL |
| RLS / grants | Unchanged |
| Replay safety | `DROP IF EXISTS` + `ADD CONSTRAINT`; re-apply fails only if constraint already present with same name after drop — safe on clean apply |
| Rollback | Re-add prior CHECKs (would fail if push/expo rows exist) |

---

# Existing Staging Data Compatibility

Pre-apply inventory (`gbgnemlpyykyhpqqbgru`):

| Table | Values | Compatible with new CHECK? |
|-------|--------|----------------------------|
| `notification_logs` | 31× `email` / `resend` | Yes |
| `notification_idempotency_claims` | 2× `email`, 13× `in_app` | Yes (`in_app` retained) |

No violating rows. **Not** `NO-GO — STAGING DATA REQUIRES REMEDIATION`.

Evidence: `evidence/pr21-staging-preapply-snapshot-2026-07-16T0132Z.json`.

---

# Local Migration Validation

| Step | Result |
|------|--------|
| Filename governance (`db:migrations:validate`) | **PASS** (11 active SQL files) |
| Local `migration up` | Applied `20260714140000` + `20260716120000` |
| Constraints after apply | push/expo + prior channels present |
| Disposable probe (`pr21-local-push-probe.sql`) | `local_probe_ok` (BEGIN…ROLLBACK) |
| Replay | Second `migration up` applied `[]` |
| `test:critical` | **123/123 PASS** |
| typecheck | **PASS** |
| lint:booking-core | **PASS** |
| Prior PR E full Vitest / next build evidence | 3334 tests / webpack build recorded in `evidence-pre-*` |

---

# Staging Pre-Apply Evidence

| Gate | Result |
|------|--------|
| Target project | `gbgnemlpyykyhpqqbgru` (shalean-platform-staging) |
| Production not target | Confirmed; no apply to `tchayecuvzssixyxlvfu` |
| Branch | `fix/princess-pre-notification-cron-reliability` |
| Working tree | Clean except `.vercel/` + this review evidence |
| Schema snapshot | Captured pre-apply |
| Production migration in progress | None for this version |
| Checksum | SHA256 recorded |
| Only this migration pending on staging | Yes (history ended at `20260714140000`) |
| CLI link | Was production; **relinked to staging** before apply attempt |
| `db push` | **Not used** |

CLI `migration up --linked` failed with Postgres connect error after relink. Approved remote path used: Supabase MCP `apply_migration` with exact SQL (ENV-03 equivalent single-migration apply via Management API, not broad push).

---

# Staging Apply

| Field | Value |
|-------|-------|
| Operator | cursor-agent (this review task) |
| Timestamp (UTC) | ~2026-07-16T01:44:26Z |
| Project ref | `gbgnemlpyykyhpqqbgru` |
| Method | MCP `apply_migration` name=`princess_pre_push_notification_channel` |
| Initial MCP version stamp | `20260716014426` |
| History repair | `UPDATE … SET version='20260716120000'` to match git filename |
| Final version | `20260716120000` |
| Checksum | Recorded in apply evidence JSON |
| Result | **success** |

Evidence: `evidence/pr21-staging-migration-apply-2026-07-16T0144Z.json`.

---

# Post-Apply Verification

| Check | Result |
|-------|--------|
| History contains `20260716120000` | **PASS** |
| Channel CHECK includes `push` | **PASS** |
| Provider CHECK includes `expo` | **PASS** |
| Claims channel includes `push` + `in_app` | **PASS** |
| Constraint comment set | **PASS** |
| Row counts after cleanup | logs 31 / claims 15 (unchanged vs pre-apply) |

---

# Notification Channel Verification

| Channel / provider | Staging post-apply |
|--------------------|--------------------|
| push / expo | Synthetic INSERT accepted |
| email / resend | Synthetic INSERT accepted |
| sms / whatsapp CHECKs | Still allowed by constraint (not exercised with live send) |

---

# Idempotency Verification

| Check | Result |
|-------|--------|
| Existing unique `(reference, event_type, channel)` | Present |
| Push claim insert | Accepted |
| Duplicate push claim | **Rejected** `23505` on `notification_idempotency_claims_reference_event_type_channel_ke` |
| Probe cleanup | Removed |

---

# RLS and Grant Verification

| Check | Result |
|-------|--------|
| RLS enabled on both tables | **true** (unchanged) |
| Policies | **0** (unchanged — service-role-only access model) |
| anon / authenticated grants | **none** |
| service_role grants | Present (14 privilege rows across both tables) |
| Migration altered policies/grants | **No** |

---

# Cron Review

| Item | Assessment |
|------|------------|
| Schedule (pre-hotfix) | `*/5 * * * *` — **blocked on Hobby** |
| Schedule (hotfix) | `0 2 * * *` once daily ~02:00 UTC (Hobby-compatible); see `23-pr21-hobby-cron-compatibility.md` |
| Auth | `verifyCronSecret` (Bearer / `x-cron-secret`) |
| Lock / idempotency | `acquireCronLock` lease 1200s; concurrent → skip |
| Success / failure logging | `logCronRun` success + new error path on job load failure |
| Stale detection | Environment-aware: local 30m; staging Hobby **26h**; Pro `*/5` deferred |
| Batch bounds | `MAX_JOBS=50`, `MAX_COMPLETE=80` |
| Uncontrolled retries | None in cron loop; notification retries capped at 5 |

---

# Vercel CPU Risk

| Risk | Mitigation in PR |
|------|------------------|
| Hobby daily invoke | One scheduled run/day; manual UAT for controlled ticks |
| Queue drain | Single ordered select with limit |
| Health | Opportunistic `evaluateLifecycleEmailAlerts` (best-effort), not a polling storm |
| Function timeout | Existing lock lease 1200s; work capped per run |

**Deploy blocker (pre-hotfix):** GitHub Vercel status on commit `f3246e3e` was **failure** (Hobby rejects `*/5`). Hotfix replaces schedule with `0 2 * * *` — see doc `23`.

---

# Test Results

| Gate | Result | Evidence |
|------|--------|----------|
| PR E targeted / critical | 123/123 PASS (pre-hotfix) | `evidence-pr21-test-critical.txt` |
| CI vitest | PASS | GitHub Actions |
| CI migration filenames | PASS | GitHub Actions |
| typecheck | PASS | re-run + `evidence-pre-typecheck.txt` |
| lint:booking-core | PASS | re-run + `evidence-pre-lint-booking-core.txt` |
| db:migrations:validate | PASS | local + CI |
| Full Vitest (prior PR E) | 3334 PASS | `evidence-pre-vitest-full.txt` |
| next build --webpack (prior PR E) | PASS | `evidence-pre-next-build.txt` |
| Vercel preview (pre-hotfix) | **FAIL** (`*/5` on Hobby) | GitHub status |
| Hobby cron hotfix | See `23-pr21-hobby-cron-compatibility.md` | Pending green Vercel after schedule change |

---

# Production Non-Impact

| Check | Result |
|-------|--------|
| Production migration history | No `20260716120000` / no princess_pre row |
| Production channel CHECK | Still `email|whatsapp|sms` (no push) |
| Production provider CHECK | Still `resend|twilio|meta` (no expo) |
| `db push` | Not run |
| Production linked during apply | No — CLI relinked to staging; apply targeted staging project id only |

---

# Recommendation

1. **Keep staging migration** — already applied and verified; required before live push audit logging.
2. **Hobby cron hotfix** — apply daily schedule + health threshold update (this ticket); wait for green Vercel check.
3. After Vercel check is green, merge to `staging` only (not main), then confirm `cron_runs` booking-lifecycle success and controlled push registration.
4. Do **not** apply this migration to production in this ticket.
5. Do **not** start Beaulla UAT from this review.
6. Backlog **PRE-CRON-PRO-01** — restore `*/5` only after Vercel Pro upgrade and separate authorization.

---

# Final Decision

## MIGRATION DECISION

**PASS — STAGING MIGRATION 20260716120000 APPLIED AND VERIFIED**

## PR DECISION (pre-hotfix)

**NO-GO — PR #21 REQUIRES ADDITIONAL WORK** — superseded by Hobby cron hotfix once Vercel check is green.

Blocker was: Vercel deployment check failed for `*/5` on Hobby. Hotfix path: `23-pr21-hobby-cron-compatibility.md`.

---

# Evidence Index

| Path | Purpose |
|------|---------|
| `evidence/pr21-staging-preapply-snapshot-2026-07-16T0132Z.json` | Pre-apply schema/data |
| `evidence/pr21-staging-migration-apply-2026-07-16T0144Z.json` | Apply record |
| `evidence/pr21-staging-postapply-verify-2026-07-16T0144Z.json` | Post-apply + probe |
| `evidence/pr21-local-push-probe.sql` | Local disposable probe |
| `evidence/pr21-staging-push-probe.sql` | Staging probe script (executed stepwise via MCP) |
| `evidence-pr21-test-critical.txt` | Critical suite re-run |
| `evidence-pr21-local-gates.txt` | Local gate summary |
| `23-pr21-hobby-cron-compatibility.md` | Hobby cron hotfix decision record |
