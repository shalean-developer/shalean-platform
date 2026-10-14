# AUDIT-03C-02 — October forward payout processing

Status: OPEN. Staging database enforcement verified; revised exact-head review and deployment verification pending.

## Authorized policy and source truth

The owner deferred unresolved pre-October history without writing it off or marking it paid. New cleaner payout processing starts with visits dated 1 October 2026. The existing July monthly-model epoch remains unchanged so historical reporting retains its interpretation. October can enter payout processing only after the Johannesburg calendar month closes on 1 November.

Production before this change contains 46 cancelled historical batches (1,488,990 cents), 48 frozen historical batches (9,730,040 cents), and 70 paid historical batches (9,342,820 cents). These are observations, not beneficiary or booking allocation proof.

## Bounded implementation

- Generation, discovery and legacy-column backfill exclude pre-October visit dates. Forward batches use the visit calendar month, including late completion. Roster and team candidates use the same visit boundary.
- Approval and settlement require a closed October-or-later full calendar month and reject historical, outside-month or undated linked items.
- Run processing and retries validate every child before any run mutation or transfer.
- The shared Paystack executor verifies the boundary before new submission, including ledger and outbox retry rails. Historical successful bank replay is read-only.
- Bank instruction export rejects historical batches. Historical run reports remain readable but omit actionable references.
- Database candidate/run RPCs apply the October boundary and cap caller-supplied closure dates to actual Johannesburg month closure. Ledger claims select only closed October-or-later visits.
- Database triggers prevent changes/deletion of historical payout batches, historical earning claims, links to historical/open batches, and historical run transitions. The migration performs no accounting-data backfill or status changes.

## Local evidence

The enforced critical suite passed 555 tests, including 31 dedicated cutoff and existing-intent verification checks. Focused generation, month, export, boundary and existing-intent checks passed 92 tests, including month-membership, late-completion and existing-provider-intent coverage. Type checking passed; enforced booking-core lint has no errors (existing warnings).

The broader payout suite was also compared with unchanged main `e40ffccf32a77026484e7194f1c90bdc87fe2fd5`: baseline had 26 failures; candidate initially had 21. Two newly failing catch-up expectations encoded the retired processing policy and were updated. Other broad-suite failures are present on baseline; they are not described as a clean full-suite pass.

## Remaining gates

1. Revised exact-head review and CI.
2. Automatic staging deployment and UI/API verification. Staging database probes already pass and all six table hashes match their pre-migration controls.
3. Reviewed production release; production historical row/hash and amount reconciliation, actual automatic deployment SHA verification.
4. Verify October beneficiary identities, included bookings and adjustment reasons before any payment approval or settlement.

No real payout, bank transfer or historical reconciliation is authorized by this implementation work. No historical accounting repair is included. Close only when the release and reconciliation evidence is recorded.

## Staging database evidence

Both migrations were exercised against `uwvnmluiqbczeduzjgse`. Transaction-contained probes reject September batches, open October batches, historical earning-link RPC calls, direct historical booking amount edits, roster amount edits, historical team paid inserts, historical ledger processing claims and member adjustment RPC calls. Future caller-supplied closure dates cannot create a run or freeze October early.

All fixture changes were rolled back. `bookings` remains 12 rows with full-row control hash `f58407f8b05cdaa2770b9cb383577c46`; cleaner payouts, cleaner earnings, roster payouts, team payouts and payout runs remain empty with hash `d41d8cd98f00b204e9800998ecf8427e`.

Initial review of `f4fd86a04a4e97ef7c713319a04f82604131e657` raised three P1 findings: existing transfer verification must precede the new-send cutoff; batch visits must remain in their period; claimed-ledger visit dates must remain fixed. Revised code addresses these and requires a fresh review. Existing external intents can still be verified; historical accounting convergence remains subject to the deferred historical-review boundary, rather than creating a new transfer or inventing a payment.

Staging ledger versions were aligned to canonical CLI-generated files `20261014140342` and `20261014142019` after candidate verification; temporary candidate ledger entries were consolidated. This changed migration metadata only.

## Verified-provider reconciliation follow-up

Latest review found three blockers on 65e68c6a. Run exports now abort on source validation errors; ledger pre-POST rejection releases or retires its send lease while retaining its claim for review. Migration 20261014145923 permits only terminal outcome convergence backed by matching transfer/outbox evidence (subject, rail, reference, cleaner and full amount). It does not authorize a new historical transfer or change amounts, beneficiaries, visit dates or links. Existing bank settlements remain protected.

Transaction tests in staging pass for historical batch failure/success/reference replay, direct booking synchronization and historical ledger/booking synchronization. Missing evidence, amount edits and unrelated references are rejected. DDL and synthetic fixtures were rolled back. Booking count/hash before and after: 12 / 3d9137ac10fdbbd2547972872a6eb100; payout, payout-transfer and outbox tables remain empty. Revised exact-head CI/review and live staging runtime checks remain mandatory. No production cutoff migration is applied.

## Production review follow-up: deletion protection

Production PR #936 review found historical pending items could be deleted during reassignment/synchronization, and the existing ledger-ordering test had stale preflight mocks. New migration 20261014155906 blocks DELETE on pre-October or unknown-date ledger, roster and team items, using OLD.booking_id with a locked visit lookup. Forward pending cleanup remains allowed. The migration changes no financial data.

Transaction probes on staging reject historical ledger/roster deletes and unknown-date deletes, verify all three table triggers, and permit forward pending deletes. All fixtures and candidate DDL are rolled back. Revised ledger execution tests cover preflight, read errors, dual-rail conflicts, outbox-before-POST ordering and historical/open-month exclusions. This follow-up must clear its own review, staging deployment and verification before production PR #936 resumes.

Review follow-up on 3f922bce: reject pre-October team assignment immediately after loading the booking, before capacity release/claim, force reopening, header/roster mutation or member payout cleanup. Historical completed reassignment is rejected with HTTP 409 for force=true and force=false; regressions assert zero capacity/assignment RPCs, zero earnings reset and unchanged captured writes. Forward assignment fixtures now use 1 October and the count stub supports the existing platform OR predicate; all 12 team-assignment tests pass.

Review follow-up on 9659e31e: shared reset safety now reads the visit date and rejects pre-October or undated resets, covering reset-earnings and edit-details/repricing before financial mutation. Direct reset has its own early guard. Cleaner attribution PATCH, visit-payout removal, recurring propagation and earnings-batch recalculation also reject/skip protected visits before their first relevant write (including skipReset). Read-only regression stubs throw on any mutation or unexpected financial-table access; they cover zero/null booking totals, forced reset options, repricing gates, attribution removal and recurring/batch paths. No database or production data changed for this application follow-up.

Review follow-up on 0ec674ff: normalize assignment visit dates through the canonical predicate, rejecting padded historical dates before any write. Team resync candidate queries filter at October and independently validate returned rows; direct roster sync checks the visit before invoking its RPC. Team lead appointment and member-removal payout-owner updates preserve historical jobs. Shared earnings persistence skips protected visits before any financial rebuild/cleanup, covering callers outside the admin reset flow. New regressions cover direct/bulk sync, padded dates, membership/lead changes and persistence skip; 27 focused cases pass. No migration or production data change is included in this application follow-up.

Follow-up review: fence recurring reconciliation before historical cancellation or creation, including draft-invoice cross-month visits; reject historical/unknown roster repair before its first write. Focused regression suite: 17 tests passed. Production unchanged pending fresh CI and independent review.
