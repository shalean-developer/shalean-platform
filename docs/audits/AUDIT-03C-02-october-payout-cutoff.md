# AUDIT-03C-02 — October forward payout processing

Status: OPEN. Implementation candidate; database and deployment verification pending.

## Authorized policy and source truth

The owner deferred unresolved pre-October history without writing it off or marking it paid. New cleaner payout processing starts with visits dated 1 October 2026. The existing July monthly-model epoch remains unchanged so historical reporting retains its interpretation. October can enter payout processing only after the Johannesburg calendar month closes on 1 November.

Production before this change contains 46 cancelled historical batches (1,488,990 cents), 48 frozen historical batches (9,730,040 cents), and 70 paid historical batches (9,342,820 cents). These are observations, not beneficiary or booking allocation proof.

## Bounded implementation

- Generation, discovery and legacy-column backfill exclude pre-October visit dates. Roster and team candidates use the same visit boundary.
- Approval and settlement require a closed October-or-later full calendar month and reject historical or undated linked items.
- Run processing and retries validate every child before any run mutation or transfer.
- The shared Paystack executor verifies the boundary before new submission, including ledger and outbox retry rails. Historical successful bank replay is read-only.
- Bank instruction export rejects historical batches. Historical run reports remain readable but omit actionable references.
- Database candidate/run RPCs apply the October boundary and cap caller-supplied closure dates to actual Johannesburg month closure. Ledger claims select only closed October-or-later visits.
- Database triggers prevent changes/deletion of historical payout batches, historical earning claims, links to historical/open batches, and historical run transitions. The migration performs no accounting-data backfill or status changes.

## Local evidence

The enforced critical suite passed 550 tests after adding 27 cutoff tests. Focused generation, month, export and boundary checks passed 84 tests before the additional historical-export regression. Type checking passed; enforced booking-core lint has no errors (existing warnings).

The broader payout suite was also compared with unchanged main `e40ffccf32a77026484e7194f1c90bdc87fe2fd5`: baseline had 26 failures; candidate initially had 21. Two newly failing catch-up expectations encoded the retired processing policy and were updated. Other broad-suite failures are present on baseline; they are not described as a clean full-suite pass.

## Remaining gates

1. Exact-head review and CI.
2. Staging database enforcement probes, unchanged-data controls, automatic staging deployment and UI/API verification.
3. Reviewed production release; production historical row/hash and amount reconciliation, actual automatic deployment SHA verification.
4. Verify October beneficiary identities, included bookings and adjustment reasons before any payment approval or settlement.

No real payout, bank transfer or historical reconciliation is authorized by this implementation work. No historical accounting repair is included. Close only when the release and reconciliation evidence is recorded.
