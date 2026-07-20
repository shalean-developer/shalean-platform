# MKT-001B.2 Slice 1 — Durable Publish Queue Implementation

**Project:** Shalean Cleaning Services  
**Phase:** MKT-001B.2 Slice 1  
**Date:** 2026-07-17  
**Branch:** `feature/mkt-001b2-durable-publishing-queue`  
**Base:** `staging` @ `32cc7c50`  
**Plan:** `docs/audits/marketing/MKT-001B.2-durable-publishing-queue-plan.md`

---

## Governance

| Constraint | Status |
|---|---|
| Branch from verified `staging` | Respected |
| Target `staging` only | Respected |
| No `main` merge | Respected |
| No production deploy | Respected |
| MKT-001A-PROD unchanged | Respected |
| Six CONDITIONAL GO conditions | Accepted + implemented |

---

## 1. What shipped

| Capability | Implementation |
|---|---|
| Durable enqueue | `social_publish_jobs` + `enqueuePublishJob` |
| CAS claim + per-job lease | `claim_social_publish_jobs` RPC + TS fallback; `leaseSpecificPublishJob` |
| Attempts / `next_attempt_at` / backoff | `publishJobBackoff.ts` + executor transitions |
| DLQ | `dead_letter` status + admin replay route |
| Provider boundary | `SocialProvider.publish` only |
| Ledger SoT | `marketing_publish_idempotency` unchanged role |
| Inline drain | `runPublish` = enqueue + lease + `executePublishJob` |
| Primary scheduler | Supabase `pg_cron` `*/5` → `/api/cron/process-social-publish-jobs` |
| Vercel backup | Daily `0 4 * * *` for process + recover |
| Replay safety | Known `external_post_id` ⇒ no second provider call |

---

## 2. Safety gates (required before staging PR)

| Gate | Evidence |
|---|---|
| Concurrent workers cannot claim the same job | `publishJobs.mkt001b2.test.ts` |
| Lease expiry permits safe recovery | same |
| Enqueue retries do not duplicate logical jobs | same |
| Provider success + DB failure ⇒ no second post | same (`external_post_id` ack-only path) |
| Retryable vs permanent state transitions | same |
| Retry delays bounded + deterministic | `publishJobBackoff` tests |
| Attempt threshold → DLQ | same |
| DLQ replay explicit + idempotent | same + `/api/admin/promotions/publish-jobs/[id]/replay` |
| No secrets / raw payloads in job rows | `sanitizePublishJobPayload` + migration comment + test |
| Sync API response shapes compatible | `runPublish` / `publishOutcomeToHttp` preserve Hub bodies |

**Test run (2026-07-17):** 14 new Slice 1 tests + prior publish suites green (see evidence file).

---

## 3. Migration

`supabase/migrations/20260717120000_mkt_001b2_social_publish_jobs.sql`

- Table `social_publish_jobs` (service-role RLS)
- Partial unique index on active `(provider, idempotency_key)`
- `claim_social_publish_jobs` (SKIP LOCKED)
- `recover_expired_social_publish_leases`
- Optional `pg_cron` schedule `social-publish-jobs` every 5 minutes

**Staging note:** apply migration on staging before relying on worker drain. Contract covered by `mkt001b2Migration.contract.test.ts`.

---

## 4. Files

| Path | Role |
|---|---|
| `supabase/migrations/20260717120000_mkt_001b2_social_publish_jobs.sql` | Schema + RPCs + pg_cron |
| `apps/web/lib/promotions/publishJobs.ts` | Enqueue / claim / execute / replay |
| `apps/web/lib/promotions/publishJobBackoff.ts` | Backoff math |
| `apps/web/lib/promotions/providers/publishingService.ts` | Enqueue + inline drain |
| `apps/web/app/api/cron/process-social-publish-jobs/route.ts` | Worker |
| `apps/web/app/api/cron/recover-stuck-publish/route.ts` | Ledger + lease sweep |
| `apps/web/app/api/admin/promotions/publish-jobs/[id]/replay/route.ts` | Admin DLQ replay |
| `apps/web/lib/cron/cronLockKeys.ts` | H-15 lock key |
| `apps/web/vercel.json` | Daily backup cron |
| `apps/web/lib/promotions/__tests__/publishJobs.mkt001b2.test.ts` | Safety gates |
| `apps/web/lib/promotions/__tests__/mkt001b2Migration.contract.test.ts` | Migration contract |

---

## 5. Explicit non-goals (unchanged)

- Production / `main`
- Schedule UI / timezone product
- New providers
- Closing MKT-001A-PROD

---

## 6. Decision

| Gate | Verdict |
|---|---|
| **Slice 1 implementation complete** | **GO** for staging PR |
| **Staging merge** | Pending PR review + migration apply + worker smoke |
| **Production** | **NO-GO** (MKT-001A-PROD) |

---

*End of MKT-001B.2 Slice 1 audit.*
