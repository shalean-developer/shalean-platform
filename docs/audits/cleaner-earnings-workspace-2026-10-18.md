# Cleaner earnings workspace — approved remediation

Owner instruction: “Lets fix them all”, following the 18 October UI/UX audit of `/jobs/earnings` (EUX-01 through EUX-11). Base main: `00fa48b86ed495c4b4cf2652c9ada8e8c4dd9de8`; production inspected: `9ee07f18a4088fabee288080e5d41a06f86c1714`.

## Scope and financial boundaries

Replace this page's ambiguous summaries and history with a complete, read-only workspace projection. Preserve booking/member earnings precedence, customer prices, completed/assigned states, payout locks, historical records and the noncanonical shadow ledger. No migrations, recomputations, financial mutations, provider submissions or payout approvals are part of this change. Existing cleaner API consumers retain their current contract; the workspace has a separate versioned endpoint.

The verified session chooses the cleaner. No query/header-selected cleaner identity is accepted. Database queries select completed non-test bookings explicitly attributed through direct ownership, roster or a persisted member payout rail. All branches and financial tables are paginated and viewer-scoped. Only viewer-safe presentation fields are returned; participant summaries, internal amounts, bank account values and other cleaner/customer details are not serialized.

## Authoritative meanings

- **Earned:** existing booking/member resolver, per completed cleaner visit. A stored zero remains zero; missing values remain unavailable. Deduplication is by booking identity within the viewer's participation.
- **Monthly earnings:** visit calendar date, with completion-instant fallback only if the service date is absent/invalid. Today/week use Johannesburg dates. Undated visits remain counted in lifetime records with an explicit date-allocation warning.
- **Recorded payment:** a paid settlement record with a valid payment instant, a reference and a valid amount; payout batches also require successful payment status. A job/retirement rule never creates a payment. Historical payment records supported by these fields remain readable. These labels describe application records, not an independent bank audit.
- **Monthly recorded payments:** all qualifying settlement records whose payment instant falls in that Johannesburg month, independent of visible pagination. Repeated same-reference/day/amount receipt evidence makes the total unavailable for review, without deleting either record. Undated payment records are disclosed separately, never assigned to their earning month.
- **Payment progress:** current/closed forward periods distinguish unbatched earnings, preparing batches, approved batches and payment issues. Batch totals can differ from earned amounts because they are distinct financial records. Approval is not receipt of payment.
- **Earlier earnings:** pre-October unverified visit earnings remain deferred for historical review, separate from forward payment processing. No data is marked paid or written off.
- **Open month:** review begins only after Johannesburg month closure; the page promises no payment date. No new payout action is exposed.

## Acceptance map

| Audit finding | Implemented behaviour | Verification |
|---|---|---|
| EUX-01 | Settlement statements replace synthetic per-job paid history; archived visits retain honest historical-review status | Retirement example, actual historical receipt and privacy tests |
| EUX-02 | Complete server aggregate independent of list pages/20-row cap | 21 settlement records = R5,250; UI pagination retains total |
| EUX-03 | Johannesburg payment grouping and formatting | Both UTC/local month boundaries, earning-month/payment-month distinction |
| EUX-04 | Explicit selected month, open/closed/historical states and monthly process explanation | October/November UI and period tests |
| EUX-05 | Preparing/approved batches, failed payment and bank-detail/help actions | State/readiness tests; read-only bank readiness boolean |
| EUX-06 | All earning details and settlement statements, month selector, search and ten-row pages | Page traversal, all-page search, month-change tests |
| EUX-07 | Full paginated completed-visit count and lifetime aggregate with shared scope | 601+ records, merged-branch deduplication and viewer allocation tests |
| EUX-08 | Darker secondary text, semantic headings, visible keyboard focus, labelled controls and status messages | DOM assertions; authenticated responsive/keyboard review remains a release gate |
| EUX-09 | Manual/60-second/focus/online refresh; server current-month mode; latest-request wins; stale figures identified after errors | Refresh, rollover and aborted-old-response tests |
| EUX-10 | Versioned validated contract, nullable unknown amounts and no ledger/paid-only fallbacks | Partial-200, genuine zero, unavailable amount, failed query and stale-preservation tests |
| EUX-11 | Short job reference, canonical detail link, consistent viewer-only breakdown, help, active-page navigation state | Viewer breakdown/adjustment tests and accessible UI controls |

## Validation and release gates

Local gates: critical tests (including the four new test files), TypeScript, booking-core lint and changed-file lint. Test cases include R252/R260/R280, explicit zero, signed deductions/bonus and formal-team precedence. Existing financial and role-security suites remain required.

A read-only production projection at 2026-10-18T21:47:22.151047Z was executed through the candidate pure model. October totals/counts matched the recorded Office evidence: Silibaziso R3,360/12; Normatter R2,560/10; Nyasha R1,300/5; Natasha R1,800/7; Elizabeth R752/3. Lifetime earnings/counts also matched the previously displayed samples. This was a source/data comparison, not authenticated endpoint or browser acceptance. Historical balances were not reconciled against bank statements.

Required next gates: independent exact-head technical review; exact-head CI; automatic staging deployment and live SHA verification; authenticated solo/member UI/API acceptance on staging, responsive/zoom/keyboard checks and payment-state fixtures; then governed production promotion, automatic activation and live verification. Do not claim those later gates from mocked tests or the production projection. Any additional test-account credential/access action must follow normal authentication controls.

Only normal GitHub push-triggered Plesk deployment is used. No manual workflow dispatch, deployment-hook invocation or history rewrite. Promotion must contain only this reviewed change. Stop on failing review/CI, incorrect environment/SHA, data preservation discrepancy, cross-account exposure or an unsupported payment claim.

The prior scoped 20-correction QA opinion stays preserved. The separate Office parent-summary refresh issue PR959-F05 is outside this page remediation.
