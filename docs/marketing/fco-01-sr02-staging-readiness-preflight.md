# FCO-01-SR-02 — Staging environment and rollback preflight

**Status:** READ-ONLY SOURCE PREFLIGHT COMPLETE; HOSTED VERIFICATION NOT PERFORMED.
**Date:** 2026-11-06
**PR:** #1083 (Draft/unmerged); no activation or change approval.
**Purpose:** Verify what *must be checked* in the actual Plesk staging environment before any owner-authorized activation.

## Source-verified controls

| Domain | Source fact | Hosted evidence required |
| --- | --- | --- |
| Client flag | `regularSimplifiedPreviewEnabled` requires Regular Cleaning, `NEXT_PUBLIC_SHALEAN_APP_ENV=staging` (or development) and `NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW=true`; production client environment is denied | Observe compiled staging bundle values using approved non-secret diagnostics; do not enable the flag for this review |
| Server flag | `fcoEquipmentReceiptEnforced` requires Regular Cleaning, `SHALEAN_APP_ENV=staging` (or development), and the same public preview flag | Establish browser/server parity on target staging release. A mismatch must fail the gate |
| Receipt signing | `FCO_01_EQUIPMENT_RECEIPT_SECRET` or `BOOKING_LOCK_HMAC_SECRET` (minimum 32 characters) is server-only; both receipt and cookie use domain-separated HMAC | Check **presence/validity only**, never reveal the value, prefix, hash, screenshots or logs. Do not rotate or change secrets during preflight |
| Session cookie | `fco01_equipment_session` is signed, HttpOnly, SameSite=Lax, path `/api/booking-v2`, Max-Age=600, Secure when `NODE_ENV=production` | Inspect a synthetic, authorized staging response **after** separate activation approval. No hosted issuance/POST during this preflight |
| Equipment fees | Server calculates delivery and issues a signed receipt; quote and confirm verify address, session, amount, expiry, and pricing policy revision | Check staging equipment policy and manual-quote fallback by approved read-only configuration source; no fee schedule changes |
| Booking/payments | Existing quote lock, cleaner/slot verification, authenticated pending-payment recovery remain authoritative | Verify Paystack test keys, Supabase staging identity, writes/outbound blocks using redacted health report; no real booking or payment action |
| Release identity | `/api/health/environment` reports deployment, `shaleanAppEnv`, `releaseSha`, redacted provider modes/ref | Compare actual Plesk staging response to the approved SHA/ref; avoid treating a GitHub preview artifact as activated Plesk code |

## Known staging identity concern

`apps/web/lib/env/deploymentEnvironment.ts` includes a *retired/paused* historical staging Supabase ref. The owner's active staging health evidence previously indicated `uwvnmluiqbczeduzjgse`. Do not infer that the retired ref is suitable for activation. The actual current staged target, environment mapping and approved project identity must be independently reconciled before release; this preflight does not change them.

## Read-only decision checklist

1. Confirm PR exact head and 9/9 required workflows including focused equipment-free regression and browser smoke; no new commits after the evidence.
2. Confirm `deploy/staging` and Plesk staging source SHA, build type, app root, startup command and running release identity; **do not pull, deploy or restart**.
3. Read the redacted staging health endpoint only if owner-authorized and no secrets exposed; require staging identity, expected Supabase project, Paystack test mode, no outstanding `issues`, and outbound/Zoho controls as governed.
4. Verify key/flag **presence and parity**, without exposing or changing values. Presence may require owner-controlled Plesk inspection.
5. Capture documented immutable pre-activation release SHA and tested, separately authorized staging rollback procedure. The reviewed `scripts/plesk-activate-prebuilt-production.sh` is **production-specific**, not proof of a staging rollback procedure. Do not reuse it as a staging action.
6. Define owner-observable acceptance for Home/Schedule/Your Details/Payment, signed-equipment quote, manual quote, zero extra rooms, saved address, quote expiry, pending-payment retry, mobile/desktop, and synthetic no-provider-write safety.
7. Confirm who approves activation and who owns rollback; no branch merge, public flag enablement, secret manipulation or Plesk activation without separate approval.

## Stop conditions

Do not activate if environment identity mismatches, a test payment key is absent in staging, a production provider key appears in staging, signing readiness is unknown, the rollback release cannot be identified, or requested analytics/financial protections are unverified.

## Decision

**FCO-SR-02 stays OPEN for hosted inspection.** The above is a source-backed preflight plan, not hosted evidence or an authorization to deploy. PR #1083 remains Draft and unmerged. Production unchanged.
