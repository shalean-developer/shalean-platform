# SR-09 — Communications consolidation closure audit

Status: **Completed pending merge of this closure PR**

Audit base: `integration/shalean-repairs` at `16a679b0461fe25f7fbf1486a992c33b416e92f7`.

## Scope reviewed

Final current-code review covered outbound email, SMS, WhatsApp and Expo push delivery/retry paths, with emphasis on duplicate delivery, policy bypass, retry fan-out, missing durable recovery records and inconsistent retry history.

## Repairs completed

### SR-09A — Durable email recovery consolidation

- Normalized thrown Resend send failures so they enter the canonical `email_outbound_messages` recovery queue.
- Prevented the retry worker from creating a new recovery row for every retry attempt.
- Preserved one durable recovery record per outbound email while retry attempts update the claimed original row.

### SR-09B — Push retry history preservation

- Fixed generic notification retry so stored Expo push attempt history is passed back into `dispatchExpoPush` instead of being reset to zero.
- Preserved the canonical retry/dead-letter budget across operator retries.

## Final closure checks

- Email retries remain behind `safeResendSend`, preserving outbound safety and durable recovery behavior.
- Customer WhatsApp retry is explicitly blocked by communication policy.
- Customer WhatsApp template helpers fail closed and cannot silently send through a legacy path.
- SMS is globally disabled by `getSmsOutboundDecision`, including generic retry paths; the remaining older Twilio helper does not create a live bypass while that policy is fail-closed.
- Cleaner WhatsApp retry uses the WhatsApp queue with an idempotency key derived from the original notification log row.
- Expo push uses canonical idempotency and now preserves prior attempt count across retries.
- No additional concrete duplicate-send, policy-bypass or non-recoverable delivery defect was found in the reviewed current code.

## Deferred/non-SR-09 work

The large mixed retry/cron orchestration route remains architectural/recovery debt, but no additional current communications-consolidation defect was proven from it in this audit. Query-cost, monitoring and recovery-worker restructuring belong to later slices where applicable rather than extending SR-09 without a concrete defect.

## Closure decision

**SR-09 — Communications consolidation: Completed** once this closure PR passes CI and merges into `integration/shalean-repairs`.

No production data change, live notification send or production deployment is authorised or performed by this closure record.
