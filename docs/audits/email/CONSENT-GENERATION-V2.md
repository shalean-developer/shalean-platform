> Historical source-preparation snapshot. PRs #1074, #1084 and #1086 are merged; staging rollout/evidence and the current end-to-end acceptance sequence are tracked in issue #1076 and [EMAIL-STAGING-END-TO-END.md](EMAIL-STAGING-END-TO-END.md). Older "unmerged/not applied" statements below describe that snapshot, not current release status. Production activation remains separately controlled.

# Issue #1076 — consent generation and unsubscribe token v2

Source preparation only. No deployment, hosted migration, provider activation or customer send is authorized by this document.

## Behaviour

- Signed payload v2 contains customer UUID, expiry, version and integer consent generation. HMAC covers all fields; existing signing secret and 90-day lifetime remain unchanged.
- Initial generation zero is revocation state, not proof of consent. Explicit authenticated grants increment the generation inside the customer-row-locked consent transaction. Failed queue writes roll back the generation and append-only event together.
- Signed withdrawals compare their generation under that same lock, before evidence/profile/queue writes. A mismatched generation is superseded, including a token never used before the later grant. Withdrawals do not increment generation, preserving same-token replay and processing leases.
- Generation updates are server-managed. A profile trigger denies changes by ordinary authenticated/anonymous database roles, even if profile UPDATE is otherwise granted.
- V1 links remain signature/expiry verifiable for a non-mutating explanation. GET presents a fixed account-preferences link; POST returns 409 without accessing the database. Users can withdraw through existing authenticated preferences. No v1 token is silently upgraded to the current generation.
- V2 GET only renders confirmation. A superseded POST returns 409 and a fixed account-preferences link, never a false successful withdrawal.
- Referral/rebooking issuance reads the verified customer's database generation. Missing schema/state or identity mismatch fails closed. The send wrapper refreshes unsubscribe headers for tagged marketing retries and records the actual headers; transactional email remains independent of this path.

## Migration and compatibility

The atomic migration in this unmerged PR has not been applied to hosted systems. It now adds the generation column/guard and uses an eight-argument RPC (last argument defaults to NULL). The previous seven-argument draft overload is removed so it cannot bypass revocation. Older callers omitting the generation can still record explicit authenticated preferences, but signed withdrawals return a legacy-confirmation outcome without writes.

Any eventual rollout must keep marketing/provider activation disabled while applying the approved schema and matching application version, then verify synthetic journeys. Do not roll back to the seven-argument implementation: that would restore stale-token writes. Retain generation state and consent evidence; use a forward correction or disable the affected marketing flow under separately approved recovery controls.

## Required evidence

Token/HMAC/expiry/tampering, legacy non-mutation, current-generation issuance, retry-header refresh, old unused-token rejection, role ownership, transaction rollback, completed/processing replay, partial recovery, actual service-role execution, and two-session grant-versus-withdrawal serialization. Native PostgreSQL CI must execute the SQL and concurrency harness on the exact candidate SHA. WASM and mocked tests are supplemental. Existing staging evidence does not validate this changed candidate; staged customer experience/policy acceptance remains required before release.
