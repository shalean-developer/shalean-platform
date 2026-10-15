# AUDIT-03C-02 — October forward payout processing

Status: staging acceptance COMPLETE for main merge 045d3b41e61518168872d5106ef21a99cb22be2b. Production release remains pending. Current release authority and execution controls are in AUDIT-03C-02-production-release.md. Entries below preserve the implementation history and may describe superseded intermediate gate states.

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

Further review: add shared booking_cleaners INSERT/UPDATE/DELETE boundary, checking both old and new booking IDs under row lock, so atomic admin/recurring roster RPCs cannot change historical attribution. Notes-only edits bypass reset safety while preserving existing paid/eligible/finalized locks. 611 critical tests pass; database roster probes added and await staging execution after review. Production unchanged.


## Consolidated audit remediation — OC-01 through OC-10

Candidate prepared after owner authorized resolving the ten findings in order. No production change or historical repair is part of this work.

| Finding | Implementation | Verification status |
| --- | --- | --- |
| OC-01 historical ownership | Recurring continuity/restoration preflight; final parent booking boundary protects ownership | Application regressions + isolated PostgreSQL; independent review/staging pending |
| OC-02 omitted financial representations | AFTER booking validation sees policy-trigger output; line/snapshot parent guards; shared computation/healing/sync preflights | Protected-field and later-policy-trigger checks pass in isolated PostgreSQL |
| OC-03 identity rekeys | Validate OLD and NEW parents before other item triggers; protect booking/cleaner/team identity | Rekey rejection checks pass in isolated PostgreSQL |
| OC-04 historical ledger insertion | Shared ledger helper defers; database item INSERT boundary | Historical helper no-write regressions and SQL rejection checks pass |
| OC-05 historical invoice fan-out | Filter collector; validate invoice month/status and page every linked visit before recompute/Zoho | Collector regression passes; live fan-out staging fixture pending |
| OC-06 historical backfill | Reject historical months before DB access; protect both insertion helpers | Direct helper and backfill no-access regressions pass |
| OC-07 partial solo assignment | Preflight common validator before healing and commands before offer mutation | Historical/padded/unknown no-offer-write tests; forward assignment tests pass |
| OC-08 cascade regression | Parent DELETE boundary; child allows missing parent only within cascading trigger depth | Real FK cascade passes in isolated PostgreSQL; full-schema staging pending |
| OC-09 operational roster completion | Compare attribution fields on UPDATE; allow completed_at-only updates | Isolated PostgreSQL operational update passes |
| OC-10 deferral contracts | Admin/PATCH and primary cleaner completion reject missing historical basis before writes; preserve existing positive basis without owner stamping/backfill; member timestamps remain operational | Admin/cleaner no-write regressions pass; live staging pending |

Validation: 629 critical tests pass; enforced lint passes with four existing warnings; typecheck passes; migration governance passes. Four audit reproductions were inverted into acceptance tests and expanded to 18 cases. An isolated PGlite PostgreSQL harness executes the actual candidate trigger functions against a minimal schema: 43 checks pass, including real cascades, post-policy validation, field changes, rekeys, historical insertion/deletion, operational completion, notes and helper grants. This does not substitute for full-schema staging or concurrency verification.

Harness: `scripts/audits/october-boundary-postgres.mjs`; install `@electric-sql/pglite` outside the repo and supply its module URL via `AUDIT_PGLITE_MODULE`, or provide the package in the runtime. It has no remote DB connection. Staging scripts suspend only named cutoff guards for transaction-local historical fixture construction, restore them before assertions, and always roll back. Production must never run these fixture scripts.

All ten findings are **implemented locally, not independently closed**. Gate remains NO-GO until fresh CI/review and full-schema/live staging evidence pass. Production PR #936 stays held.

Review follow-up: snapshot allocation lines now use the same historical detail boundary, with booking/line ownership validation; snapshot persistence and recomputation independently preflight before any parent upsert or allocation deletion. Three no-write helper cases and four additional PostgreSQL allocation/cascade checks pass. Revenue-path eligibility fixtures retain an empty time (to isolate cleaner availability), with a valid forward date instead of bypassing the new date boundary.


Review follow-up on e5915904: mixed-period October draft invoices now recompute and sync after forward visit changes, retaining the historical booking rows rather than skipping the invoice after cancellation. Pre-October invoices and October invoices with no forward visits remain outside automatic fan-out. Three propagation integration cases cover mixed, historical-only and historical invoice periods, including recompute/Zoho calls and zero booking writes. The historical line-item projection now includes item_type, slug, name and metadata, which are earnings-classification inputs. Four additional actual PostgreSQL rejection checks cover those fields. Validation: 632 critical tests and 47 isolated PostgreSQL checks pass; exact-head CI and independent review remain required. No production changes.


Review follow-up on d70b0328: historical manual adjustments now use the shared financial-detail trigger for INSERT/UPDATE/DELETE, including both booking identities and cascade handling. Dispute resolution checks the booking date before its first UPDATE when an adjustment is requested, returning 409 for deferred history and 500 for read errors. Operational resolution without an adjustment retains its existing flow. The protected booking basis includes cleaner_share_percentage and the direct canonical resolver inputs (appointment time/assignment timestamp, service, base/fee, price snapshot and locked booking basis), while admin_notes and refund-workflow metadata remain operationally editable. Four dispute-route regressions verify zero writes on old/padded/undated dates and read errors. Actual PostgreSQL tests verify adjustment insertion/update/deletion/rekey rejection, permitted forward adjustment and share changes, and the stored financial-basis fields. Production remains unchanged; review and staging closure are pending.

Review follow-up on 8321646a: governed draft seed fixture BK-014 now receives a forward visit date rather than attempting an undated INSERT. The database cutoff remains unchanged. This resolves the identified missing-date fixture; it is not evidence that the complete shared seed has been executed against the new full schema. Historical relative-date and financial seed fixtures require separate governed full-seed verification before claiming seed readiness. No shared seed or production mutation was run.


Review follow-up on 1d4cea5d: stored paid-total fallback inputs (total_paid_zar, total_paid_cents, amount_paid_cents) are now protected for historical bookings, rather than leaving a mutable canonical earnings basis. The complete 15-booking seed timeline uses a common whole-week shift when its oldest (-42-day) scenario would precede October, preserving relative gaps and weekdays. A credential-free `--validate-bookings` mode builds and validates the actual fixtures without constructing a DB client. Four regressions exercise all 15 real fixture dates and clock-controlled October/November/December timelines. This prepares only synthetic forward fixtures; it does not update existing historical rows. Historical shared-seed reset/finance lifecycle behavior remains a separate full-schema verification requirement and has not been represented as passing. Production unchanged.


### Finance seed closure and CI follow-up

The seed-date child-process test supplies NODE_ENV=test, satisfying Next.js ProcessEnv augmentation in CI. Finance fixtures now use the Johannesburg calendar: paid booking fixtures use the latest closed October-or-later month when available; open-month paid/approved earnings become pending with approval/payment metadata cleared. Before November 1, 2026 in Johannesburg, payout fixtures are explicitly deferred and reported as zero. Later payout fixtures use a closed monthly period, without pre-approved empty payout runs. Settlement timestamps are aligned with the closed fixture dates. Each finance upsert checks database errors and returned row confirmation; the seed aborts rather than reporting uncreated rows. Booking-date read errors also abort.

Regression coverage includes Johannesburg month rollover, later closed months, invalid/historical dates, open-month downgrade, each finance table's write failure, incomplete write confirmation, actual confirmed counts and skipped run/deferred-payout writes. Local critical suite: 669 tests across 60 files; booking-core lint and migration governance pass. No shared seed execution or production mutation was performed. Exact-head CI, independent review and full-schema staging verification remain required.


### Documented staging reseed fixtures

Independent review of 6f5531df found a separate ENV-03 seed path with three undated bookings. The staging reseed now calls a pure fixture builder that supplies a valid forward date for pending, partial-payment and zero-cash scenarios. Retained financial fixtures remain untouched. Three clock regressions exercise the actual builder in October, November and December without credentials or database access. All 672 critical tests pass. This does not claim a shared reset/reseed has run; no staging data was reset.


### Verified historical booking payments and creator FK retention

Review of f983af5a identified two remaining regressions. Historical delayed Paystack captures now use a service-role-only RPC after existing currency/amount/identity validation. It locks the booking, checks the original observed identity/reference/status, records payment fields only and restores its transaction-local exception context. Required Cleaning Credit settlement remains synchronous, while historical roster/pricing/earnings reconstruction and dispatch are skipped. Direct paid-total edits remain rejected. Partial refund convergence is limited to a matching existing submitted/pending non-record-only provider intent transitioning to succeeded, a provider reference, unchanged request identity/amount/currency and exact remaining paid totals. Other historical protected fields remain compared. Creator nulling is allowed only for nested FK updates of adjustment created_by, preserving amount, booking, cleaner and audit email.

Validation: 779 critical tests / 61 files, typecheck, booking-core lint (four existing warnings), migration governance and 81 isolated PostgreSQL checks pass. Four full-schema staging candidate probes pass with both pending migrations installed only inside rolled-back transactions: cutoff, payout-provider convergence, historical item deletes and historical booking payment convergence. The new payment probe proves wrong-reference/direct paid-total rejection, verified capture and partial refund persistence, preserved pricing/roster/stored earnings and no leaked capture exception. Staging bookings remain 12 with hash 3d9137ac10fdbbd2547972872a6eb100; payouts and earnings remain zero with empty-table hashes. No migration or fixture from these candidate checks persisted. Live post-deployment staging verification and clean exact-head independent review/CI are still required; production remains unchanged.


### Selected-cleaner capture and legacy seed generation retention

Review of 5cab3041 identified the assigned-status constraint and upgrade path for pre-cutoff seed fixtures. Historical capture now chooses pending_assignment when a cleaner or selected cleaner exists, otherwise pending. The full-schema rolled-back payment probe now includes an actual selected cleaner; the isolated harness includes the real assigned-status CHECK. Both pass.

The forward development seed has a separate DEVSEED-OCT2026 reference namespace and disjoint booking/earnings/payout/run/recurring/invoice/proposal UUIDs. It does not upsert or reset the earlier DEVSEED-BK fixture graph. Shared cleaner/team parents are retained when that earlier generation exists. ENV-03 reset retains historical/undated bookings before attempting deletion. Pure policy tests and actual seed-builder/DB-mocked reset integration tests prove old IDs, references and parents are preserved; no broad historical mutation exception was added. The new prefix retains the DEVSEED- prefix required by existing reset preflight RPCs. Counts describe the forward generation, not all retained rows.

Validation: 791 critical tests / 62 files, local typecheck and 82 isolated PostgreSQL checks pass. Existing seed-safety tests are also run. Full shared reset/reseed execution remains unperformed, as it would replace staging fixtures; no data reset is claimed. Exact-head independent review/CI and deployed staging UI verification remain required.


### Undated capture and stable reseed dates

Review of 7f649712 identified undated capture routing and paid fixture month drift. Existing pending bookings with any non-current date, including null, now use the verified capture RPC; new inserts continue through the ordinary path. The RPC preserves null dates rather than inventing a visit date. The rolled-back full-schema probe covers both September and null dates with selected cleaners, and confirms unchanged historical financial/roster fields.

Fixed paid fixture IDs now stay on October 4/7. Payout fixture periods and approval/payment/frozen timestamps stay in October after that month closes; before closure earnings are pending and payouts are deferred. All existing forward booking dates are retained on reseed, preventing approved/paid linked visits from moving as the clock advances. Stored-date read failures abort before booking writes. Regressions cover November-to-December stability and the actual reseed writer with existing dates.

Validation: 794 critical tests / 62 files, typecheck and 84 isolated PostgreSQL checks pass. Latest full-schema staging payment probes pass; all candidate schema/data changes rolled back. Staging remains 12 bookings with unchanged hash 3d9137ac10fdbbd2547972872a6eb100, zero payouts/earnings and zero persisted pending migrations. Live staging health/environment is currently inaccessible from this tool environment; deployed runtime SHA evidence remains open in addition to fresh independent review/CI and post-deployment UI verification.


Finance fixture timestamp completion: approved/paid/frozen timestamps now use the first instant after the relevant visit/payout month closes in Johannesburg, rather than a visit-day or last-day timestamp within the open month. They remain stable across reseeds. A first-eligible-instant regression passes. Current local critical suite is 795 tests / 62 files; typecheck passes. No new shared mutation was required.


### Historical verified capture mismatches

Review of 4fdb52bc found currency/amount mismatch branches before the normal historical capture command. Those branches now use the same restricted RPC in mismatch mode. It records the verified reference, amount, currency, timestamp and reason in booking_snapshot.verified_capture_mismatch and sets payment_mismatch/payment_completed_at without rewriting the old paid totals, pricing or earnings. This avoids representing foreign currency as ZAR. Recovery is enqueued only after durable mismatch state; competing identity changes still fail before recovery/success side effects.

Verified metadata can bind an existing legacy UUID-placeholder/null reference to its original booking, while the original observed identity/reference remains checked. Replacing a different real provider reference is still refused. The full staging schema requires non-null paystack_reference, so its probe uses a UUID placeholder; isolated compatibility tests additionally cover nullable legacy references.

Validation: 802 critical tests / 62 files, typecheck and 94 isolated PostgreSQL checks pass. Six application mismatch/binding scenarios cover September/null dates, currency/amount mismatches, legacy metadata binding and competing identity. Full-schema rolled-back probes cover selected-cleaner September/null capture, UUID reference binding, refund convergence, and both mismatch modes with preserved paid totals. No actual capture/refund/provider request ran. Exact-head CI/independent review, persistent staging deployment and runtime/UI verification remain open.
