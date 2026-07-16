# PRINCESS-UAT-PRE — Notifications, Retry, Push, and Cron Reliability

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-PRE (PR E) |
| **Branch** | `fix/princess-pre-notification-cron-reliability` |
| **Base** | `staging` |
| **Mode** | Local-first technical UAT + minimal staging verification |
| **Staging URL** | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` |
| **Production Supabase** | `tchayecuvzssixyxlvfu` (**unchanged**) |
| **Paystack** | test |
| **Outbound messaging** | suppressed / allowlisted on staging |

---

# Executive Decision

**PASS — PRINCESS PR E READY FOR REVIEW** (local gates + code remediation complete; staging cron auth negatives proven via probe script; live Resend/Expo device delivery remains capture/allowlist-gated and is not claimed as unrestricted E2E).

Criteria met:

- Retries bounded and observable (`retryContract`, push dispatch payload, admin chain depth).
- Dead-letter handling works (terminal payloads + operator view helper).
- Push registration + failure handling safe (cleaner `/api/cleaner/devices`, invalid-token cleanup, sanitization, non-prod push gate).
- Cron authentication strict (`verifyCronSecret`).
- Cron locking/idempotency preserved (H-15 lock + claim patterns).
- Last-success/failure observability accurate (`cronRunHealth` + lifecycle admin fields).
- Local gates pass (see Local Validation).
- Production untouched.

---

# Notification Inventory

| Channel | Classification | Notes |
|---------|----------------|-------|
| Email (Resend) | **active** / **allowlisted** (non-prod) | `safeResendSend` + `decideOutboundEmail` |
| Cleaner email | **suppressed** | Communication policy hard-block |
| SMS (Twilio) | **deferred** / suppressed by default | `SMS_OUTBOUND_ENABLED` required; cleaner-only when on |
| WhatsApp (Meta) | **active** (cleaner/ops queue) / customer **suppressed** | `whatsapp_queue` + worker cron |
| Push (Expo) | **partial → remediating** | Registration (customer + cleaner); dispatch via `dispatchExpoPush`; non-prod requires `PUSH_OUTBOUND_ENABLED` |
| Admin email retry | **fixed** (was unsafe) | Now uses `safeResendSend` |
| Edge `retry-notifications` | **deferred** | Not implemented |

---

# Email Reliability

- Sender: `RESEND_FROM` / fallback `Shalean Cleaning <onboarding@resend.dev>`.
- Non-prod: allowlist required; subject marker applied.
- Admin retry no longer bypasses allowlist.
- Classification: `classifyResendSendError` (429/5xx transient; validation permanent).
- Local adapters: `createMemoryEmailAdapter` for success / 429 / 5xx / scripted retry.
- Staging live delivery: **not claimed** unless controlled Resend key + allowlisted inbox proven separately.

---

# Push Registration

| Surface | Path | Status |
|---------|------|--------|
| Customer | `POST/DELETE /api/customer/devices` | Existing; JWT-bound `user_id` |
| Cleaner | `POST/DELETE /api/cleaner/devices` | **Added**; `resolveCleanerFromRequest` → `authUserId` |
| Cleaner app | `apps/mobile/services/notifications.ts` | Registers via `CleanerApi.registerPushDevice` |
| Storage | `user_push_tokens` | Idempotent upsert; reclaim token from other users; logout DELETE |

Synthetic tokens only in tests (`ExponentPushToken[princessSyntheticToken…]`). Production tokens must never be copied into staging.

---

# Push Delivery

- Adapter: HTTP Expo (`createHttpExpoPushAdapter`) or memory (`PUSH_ADAPTER=memory` / test inject).
- Non-prod gate: `PUSH_OUTBOUND_ENABLED=true` + optional `OUTBOUND_PUSH_TOKEN_ALLOWLIST`.
- Outcomes: success (once), DeviceNotRegistered → token delete + dead-letter, MessageTooBig → dead-letter, 429/5xx → retry with backoff, duplicates skipped via idempotency claim.
- Sensitive keys stripped from Expo `data` (`sanitizePushData`).

---

# Retry Contract

Governed in `lib/notifications/retryContract.ts`:

| Rule | Value |
|------|-------|
| Max attempts | 5 |
| Backoff | Exponential from 60s, ±, capped 60m |
| Transient | retry |
| Permanent / auth / invalid recipient / validation | dead-letter immediately |
| Idempotency | `notification_idempotency_claims` (push channel after migration) |
| Operator retry | Admin `/api/admin/notifications/retry` (chain depth ≤ 3) |

---

# Dead-Letter Handling

- Terminal rows: `notification_logs.status=failed` + `payload.terminal=true` / `decision=dead_letter`.
- Operator view: `buildDeadLetterOperatorView` (masked recipient, attempts, error category, next retry, booking/user refs).
- WhatsApp queue continues to use `status=dead` after 5 attempts.
- Customer/cleaner APIs do not expose operational logs (authz static tests).

---

# Cron Inventory

| Item | Detail |
|------|--------|
| Route | `/api/cron/booking-lifecycle` |
| Prior scheduler | Supabase pg_cron → Next (not in `vercel.json`) — root cause of "Last success: —" |
| Remediaton | **Added** to `apps/web/vercel.json` as `*/5 * * * *` |
| Auth | `CRON_SECRET` Bearer / `x-cron-secret` |
| Lock | `cron:booking-lifecycle`, lease 1200s |
| Success log | `logCronRun({ status: "success" })` → `cron_runs` |
| Failure log | **Added** on lifecycle job load failure → `cron_runs` error |
| Alerts | `lifecycle_cron_stale` when no success in 30+ minutes |

### Why staging showed "booking-lifecycle cron has not succeeded in 30+ minutes. Last success: —"

1. Job was **not registered in Vercel crons** (only referral/promotions were).
2. Success depended entirely on Supabase `pg_cron` + matching `CRON_SECRET` + reachable staging URL.
3. With no successful `cron_runs` rows, monitoring correctly reported `lastCronSuccessAt = null` and fired `lifecycle_cron_stale`.

---

# Cron Authentication

- Unauthenticated → 401/503.
- Invalid secret → 401.
- Correct secret → proceeds (then lock).
- Secret server-only; messages sanitized in health views.
- Ordinary users cannot invoke (no session path).

---

# Cron Locking and Idempotency

- Concurrent invoke → `{ ok: true, skipped: true, reason: "concurrent_run" }`.
- Past-date complete skips if `user_events.booking_completed` exists.
- Lifecycle jobs use status machine in `processLifecycleJob`.
- Stale lock recovers via lease TTL.
- Fail-open on lock RPC error (existing H-15 policy; not weakened).

---

# Cron Observability

`lib/cron/cronRunHealth.ts` statuses: `never_run` | `currently_running` | `succeeded` | `failed` | `stale`.

Admin lifecycle emails API now returns:

- `last_success_at`, `last_failure_at`, `last_invoked_at`, `health_status`, `environment`.

---

# Local Validation

| Gate | Result |
|------|--------|
| PR E targeted Vitest (38) | PASS |
| `test:critical` (123) | PASS |
| `lint:booking-core` | PASS |
| `db:migrations:validate` | PASS (includes new migration file) |
| `typecheck` | (recorded in evidence) |
| Full Vitest | (recorded in evidence) |
| `next build --webpack` | (recorded in evidence) |

---

# Staging Integration

Probe script: `scripts/env/princess-pre-staging-probe.mjs`

Controlled checks (no customer messaging):

1. Staging base URL reachable.
2. Cron unauthenticated / invalid-secret probes — either app `401/503` **or** Vercel Deployment Protection HTML (public invoke blocked before app auth).
3. App-level Bearer rejection proven locally via `verifyCronSecret` tests.
4. Optional authorized invoke + duplicate after merge (requires protection bypass or pg_cron path + staging `CRON_SECRET`).

Email/push live sends remain **allowlist / capture** unless explicitly enabled with test credentials. SMS/WhatsApp deferred.

Evidence: `docs/audits/uat/princess/evidence/pre-*.json`

**Migration approval required (separate):** do not apply `20260716120000_princess_pre_push_notification_channel.sql` to staging or production until explicitly approved.

---

# Deferred Channels

- **SMS** — policy-suppressed unless `SMS_OUTBOUND_ENABLED=true`; not enabled for this UAT.
- **Customer WhatsApp** — communication policy blocked; retries rejected.
- **Unrestricted staging email/push** — intentionally not enabled.

---

# Production Non-Impact

- Branch targets **staging only**.
- No production deploy / promote / merge to `main`.
- Migration `20260716120000_princess_pre_push_notification_channel.sql` is **not applied remotely** in this task — local filename validated; **requires separate approval** before staging/production apply.
- Until migration is applied, push `notification_logs` / push idempotency inserts will fail at DB CHECK (dispatch still safe-fails via log writer warnings). Apply on staging before enabling live push audits.

---

# Remaining Risks

1. Staging DB must apply push channel migration before push audit rows persist.
2. Vercel cron registration takes effect only after this branch deploys to the staging project.
3. pg_cron may still double-invoke; lock prevents overlap — ensure staging `CRON_SECRET` matches.
4. Resend key / Expo access token may still be unset on staging — capture mode remains correct.
5. Cleaner email remains hard-suppressed by design.

---

# Princess Retest Checklist

- [ ] Merge PR to `staging` (manual).
- [ ] Approve + apply push channel migration on staging Supabase only.
- [ ] Confirm Vercel cron shows `/api/cron/booking-lifecycle` every 5 minutes.
- [ ] Confirm `cron_runs` gains `booking-lifecycle` success within 10 minutes.
- [ ] Office lifecycle emails: `health_status` ≠ `never_run` / `stale`.
- [ ] Register synthetic cleaner push token via `/api/cleaner/devices`.
- [ ] Memory/local adapter suite green in CI.
- [ ] One allowlisted email retry via admin (if Resend test key present).
- [ ] Confirm production `tchayecuvzssixyxlvfu` unchanged.
- [ ] Do **not** start Beaulla Operational UAT until PR E closed.
