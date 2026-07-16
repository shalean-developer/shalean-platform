# PRINCESS-UAT-PRE-HOBBY-CRON-HOTFIX — PR #21 Vercel Hobby Cron Compatibility

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-PRE-HOBBY-CRON-HOTFIX |
| **PR** | [#21](https://github.com/shalean-developer/shalean-platform/pull/21) |
| **Branch** | `fix/princess-pre-notification-cron-reliability` |
| **Base** | `staging` |
| **Mode** | Staging-only deployment-compatibility hotfix |
| **Vercel plan** | Hobby |
| **Production** | Untouched (no merge to main / no promote) |

---

# Executive Decision

**PASS — PR #21 HOBBY CRON HOTFIX READY FOR REVIEW**

The only PR #21 deploy blocker was `*/5 * * * *` on Hobby. Schedule is now once-daily (`0 2 * * *`), manual authenticated UAT invocation is preserved, health thresholds match the daily cadence, and locking/idempotency remain intact for multi-scheduler safety.

Vercel deployment check on the hotfix SHA: **pass** (`Deployment has completed`).

---

# Vercel Plan Constraint

Official Hobby cron constraints ([Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing)):

| Constraint | Hobby |
|------------|-------|
| Maximum frequency | **Once per day** |
| Expressions more frequent than daily | **Fail deployment** |
| Timing precision | **Per-hour** (±59 min), not exact minute |

`*/5 * * * *` requires **Vercel Pro** (or Enterprise) or an external scheduler. It must not be restored in `vercel.json` while the team remains on Hobby.

Deployment symptom on PR #21 pre-hotfix: GitHub Vercel status **FAILURE** with Hobby daily-only cron documentation.

---

# Temporary Daily Schedule

| Item | Value |
|------|-------|
| Path | `/api/cron/booking-lifecycle` |
| Temporary Hobby schedule | `0 2 * * *` |
| Meaning | Once daily, around **02:00 UTC** |
| Hobby actual window | May fire anytime in **02:00–02:59 UTC** |

**Operational risk:** Acceptable for staging UAT. Daily auto-tick is a safety net only; controlled staging tests use authenticated manual invocation. This daily schedule is **not** equivalent to the intended five-minute production cadence.

Other existing daily crons in `vercel.json` (referrals/promotions) remain unchanged and already Hobby-compatible.

---

# Manual UAT Invocation

The booking-lifecycle endpoint remains manually invokable for controlled staging testing.

| Check | Result |
|-------|--------|
| Unauthenticated | Rejected (`401` / `503` if secret unset) |
| Invalid `CRON_SECRET` | Rejected (`401`) |
| Valid staging `CRON_SECRET` (Bearer or `x-cron-secret`) | Accepted |
| Customer / cleaner / admin browser sessions | Cannot invoke without server cron secret (JWT/cookie alone insufficient) |
| Manual vs scheduled path | Same handler: `verifyCronSecret` → lock → batch → `logCronRun` |

Do **not** expose `CRON_SECRET` in docs, client code, or commits. Operators use server-side env / secure ops tooling only.

---

# Scheduler Ownership

| Scheduler | Status on staging | Notes |
|-----------|-------------------|-------|
| **Vercel Cron** | Active (Hobby daily `0 2 * * *`) | Authoritative *registered* Vercel schedule for this PR |
| **Supabase pg_cron** | May still be active historically | Legacy `invoke_nextjs_cron('/api/cron/booking-lifecycle')` existed; **not disabled** by this hotfix (requires explicit authorization) |
| **Manual operator** | Supported | Authenticated HTTP to same route |

**Can more than one scheduler invoke the same handler?** Yes.

**Duplicate safety:** `acquireCronLock` (lease 1200s) returns `skipped: true` on overlap; job processing remains bounded (`MAX_JOBS=50`, `MAX_COMPLETE=80`); notification idempotency claims prevent duplicate sends where claimed.

**Authoritative for staging Hobby deployability:** Vercel Cron must be daily so the project can deploy. pg_cron, if still firing more often, remains a possible higher-cadence path and is protected by locking — do not disable without authorization.

---

# Health Threshold Update

Environment-aware contract via `resolveBookingLifecycleCronStaleAfterMinutes`:

| Mode | Stale threshold |
|------|-----------------|
| Local / manual / development | **30 minutes** |
| Staging / preview (Hobby daily) | **26 hours** (1560 minutes) |
| Future Pro `*/5` (PRE-CRON-PRO-01) | **30 minutes** (constant documented; not enabled) |

Statuses remain distinct: `never_run` | `currently_running` | `succeeded` | `failed` | `stale`.

Genuine failures stay `failed` and are not masked as schedule lag. Lifecycle stale alerts fire only for `stale` / `never_run`.

Admin lifecycle UI consumes server `health_status` + `stale_after_minutes` instead of a hard-coded 30-minute client check.

---

# Vercel CPU Considerations

| Topic | Assessment |
|-------|------------|
| Hobby daily invoke | One scheduled execution/day → lower CPU vs `*/5` |
| Manual UAT | Operator-controlled; still lock-serialized |
| Batch bounds | Unchanged |
| Duration | Unchanged lease/work caps |

Daily schedule reduces scheduled CPU; it does **not** replace need for Pro review before restoring five-minute cadence.

---

# Future Pro Restoration Plan

Deferred schedule: `*/5 * * * *` (`BOOKING_LIFECYCLE_PRO_SCHEDULE`).

Restore **only** after:

1. Vercel team confirmed on Pro (or equivalent supported plan);
2. Deployment check accepts the schedule;
3. CPU / usage budget approved;
4. Cron duration and invocation cost reviewed;
5. A **separate** authorized change.

### Backlog

**PRE-CRON-PRO-01** — Restore five-minute booking lifecycle cadence after Vercel Pro upgrade.

---

# Tests

| Area | Coverage |
|------|----------|
| Hobby-compatible `vercel.json` schedule | Assert `0 2 * * *`; Pro `*/5` not enabled |
| Auth missing / invalid / valid | `verifyCronSecret` |
| Session-style headers without cron secret | Rejected |
| Duplicate concurrent invoke | Lock skip path static guard |
| Daily schedule health threshold | Staging 26h succeed vs stale |
| never_run / failed / currently_running | Classifier |
| Future Pro schedule not enabled | Constant + vercel.json assertion |

Local gates: PR E targeted + `test:critical` + full Vitest + typecheck + `lint:booking-core` + migration validate + `next build --webpack`.

---

# Production Non-Impact

| Check | Result |
|-------|--------|
| Base branch | `staging` only |
| Merge to main | **Not done** |
| Production promote | **Not done** |
| Production Supabase | Untouched |
| Beaulla UAT | **Not started** |
| Outbound unrestricted | **Not enabled** |
| Cron auth / lock / idempotency / retry / observability | **Preserved** |

---

# Final Decision

**PASS — PR #21 HOBBY CRON HOTFIX READY FOR REVIEW**

Criteria:

- [x] Vercel schedule ≤ once per day (`0 2 * * *`)
- [x] Vercel deployment check green after CI rerun
- [x] Manual staging invocation remains secure
- [x] Health thresholds match daily cadence (staging 26h)
- [x] Duplicate scheduler execution remains safe (lock)
- [x] Tests updated; local + CI vitest pass
- [x] Production unchanged

Residual: GitGuardian may still flag an intermediate JWT-shaped *test fixture* that briefly appeared in an earlier hotfix commit and was removed from HEAD. That string was never a real credential. Operator may dismiss as false positive or authorize a squash/rewrite if required for merge policy.

If Vercel check fails again for a non-schedule reason, reopen as **NO-GO — PR #21 REMAINS BLOCKED**.
