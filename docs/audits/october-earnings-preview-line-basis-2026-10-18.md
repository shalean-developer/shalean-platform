# October earnings reset preview — eligible line basis

## 1. Document control

ID: OCT-PREVIEW-LINES-20261018. Version 1, 18 October 2026.
Status: owner authorized the bounded review/staging/production sequence on
18 October 2026 after reviewing the prepared fix and test results. Engineering owns
implementation; the Shalean owner owns release authorization. Final technical
review, CI, staging acceptance and production acceptance are outstanding.

## 2. Executive summary

The approved R252 correction was stopped before confirmation because the Office
reset preview displayed R4. The sanitized real preview pipeline reproduces
360 cents (R3.60), which the UI rounds to R4. The proposed read-only fix resolves
the eligible service-line subtotal in cents before invoking the canonical engine.
The same test then projects 25,200 cents (R252), with no change from the stored
R252 header. The remaining ten production corrections stay on hold.

## 3. Scope and context

Change only the October-onward, non-formal-team Office preview calculation.
Read existing service lines with the eligibility resolver already used during
recomputation. May–September, invalid/undated visits and formal-team previews
retain their existing paths. Database migrations and financial corrections are
outside this code change. The separate stale operational-summary finding remains
open; refreshing the page remains necessary during verification.

## 4. Governance and traceability

Sources: `october-earnings-basis-2026-10-15.md`,
`october-fixed-basis-production-release.md`, and PR959 production evidence
finding PR959-F06. The existing approved requirement is R252 for the specified
8 October solo visit. R280 solo and R260 per paired participant remain regression
requirements. All existing payout guards and production preservation checks apply.

Preparation base: current `main` c1f5cb42e57eb4d14022dfb5e988c4f215a3d721.
Production head inspected: 2247f6e91cb3d06b965bf8606115272342463317.
The preview and payout-basis source files are identical between these heads.
The isolated checkout preserves the earlier dirty working checkout.

## 5. Current state

The preview calls the canonical resolver without the eligible line subtotal.
For the affected record, `base_amount_cents` is null, the legacy price snapshot
has `base_price: 360`, and the existing eligible line is 36,000 cents. The shared
snapshot fallback treats 360 as cents. Recompute already obtains eligible line
prices in cents; the preview omitted that input.

## 6. Evidence classification

Verified: authenticated Office displayed the unexpected R4 projection and the
preview was cancelled. Direct read-only comparison proves the record and its
derived rows stayed unchanged. Ten reset audits exist, covering the ten earlier
verified corrections. The sanitized integration test executes the real preview,
canonical resolver and comparison paths and fails before this change with
360 versus expected 25,200 cents.

Verified locally: after the change the same path projects R252. Shared deployed
behavior has not yet been verified with this fix. This is delivery evidence,
not independent final QA approval.

## 7. Analysis and recommendation

Use the same existing eligible line subtotal as recompute. This bounded change
has one additional read per current non-team preview. Keep generic snapshot-unit
normalization as a separate investigation because multiple callers and legacy
representations require population-specific evidence. No historical repair is
included.

## 8. Technical design

`computeLiveBookingEarningsSummary` reads line identity, classification,
metadata, eligibility and price fields. It calls
`sumEligibleLineItemsSubtotalCents`, passing a positive subtotal to the existing
canonical resolver. A read error withholds the computed projection. When no
positive eligible subtotal exists, the existing booking fallback remains.
The new integration tests are included in `test:critical`.

## 9. Non-functional assessment

Read-only database access; no new credentials, permissions, endpoints or user
inputs. Authentication and guarded reset authorization are unchanged. Existing
eligibility logic excludes company-only fees, supplies and explicit ineligible
lines. No database, invoice, payment, payout, transfer, schedule or roster writes
are introduced. The extra query is bounded to the requested booking.

## 10. Validation and quality

The new integration suite covers the R252 reproduction, eligible extras and
excluded charges, failed line reads, locked R280 solo and R260/R260 paired
amounts, empty/zero eligible subtotal fallback, historical/invalid dates,
formal-team path preservation and read-only execution.

Local validation passed: 1,325 critical tests across 113 files, including 12 new
integration cases; TypeScript; booking-core lint (four existing warnings);
changed-file lint; whitespace checks. Results are recorded in the PR959 evidence
checkpoint.
Fresh hosted CI and independent technical review remain release gates.

## 11. Deployment and operations

After authorization: publish the bounded change for technical review and CI;
merge through the existing automatic staging deployment; verify exact live SHA
and read-only expected R252/R280/R520 previews. Then follow the governed
production promotion and automatic Plesk deployment, verify live SHA, and re-read
all remaining targets before resuming approved guarded resets one at a time.
No migration or manual Plesk operation is required by this change. Production
corrections still stop on errors, skips, mismatched amounts or preservation drift.

## 12. Residual risk

A preview alone does not prove the subsequent guarded reset succeeded. Continue
per-record direct database reconciliation. Generic price-snapshot fallback when
no positive eligible lines exist is unchanged. The separate stale summary UI
finding, missing production cleaner login and historical comparison limitations
remain open. Production acceptance cannot be claimed from local tests.

## 13. Intended outcome

A truthful R252 reset preview allows the remaining approved work to continue
once release gates pass, avoiding approval of an unexpected financial projection.
No additional money movement or payout-batch scope is introduced.

## 14. Gate decision

Local code preparation: PASS when the recorded local checks pass.
Shared release: NO-GO until technical review, CI and staging
acceptance are complete. Production corrections remain blocked pending a
verified deployed fix and correct preview.

## 15. Handover

Engineering: owner authorization received for this exact bounded change;
complete review/CI/staging, then governed production verification. Resume only
the existing ten approved targets after rechecking their guards and identities.
The owner does not need to submit more screenshots, run SQL or edit Plesk.
