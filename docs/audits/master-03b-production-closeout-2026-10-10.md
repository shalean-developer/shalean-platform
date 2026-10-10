# MASTER-03B production closeout — 2026-10-10

## Scope
Align cleaner payout runs with Shalean's operational source of truth: monthly bank-transfer settlement, while preventing duplicate settlement when Paystack history is uncertain.

## Audit sequence completed
- Audit / source-of-truth proof
- Defect fixes
- Regression coverage
- Staging deployment and UI verification
- Bounded production promotion via PR #872
- Automatic Plesk production deployment
- Production runtime SHA verification
- Production migration preflight and application
- Production UI + DB reconciliation
- Source-branch reconciliation back to main (this PR)

## Release evidence
- Staging verified main release: `5f7b65ba43471a83cc9d38d0b416428288defd14`
- Production PR: #872
- Production merge SHA: `9af0e3d16b25493e4f974e9ad1972d0daf2657dc`
- deploy/production commit: `1f38d28928af6c18ee73b1c7a19fd31e10f33c7f`
- Live production `/api/health/environment` reported release SHA `9af0e3d16b25493e4f974e9ad1972d0daf2657dc`
- Production environment: `paqjwfulwywtsyyvdxrq`, Paystack live/live, issues empty

## Database
Applied in production:
- `master_03b_reconcile_absent_paystack_intent`
- `master_03b_block_unresolved_outbox_bank_settlement`

Post-apply checks:
- reconciliation column/function/trigger present
- settlement RPC contains unresolved-outbox guard
- unresolved cleaner payout outboxes: 0
- legacy uncertain failed cleaner payout outboxes: 0
- approved cleaner payouts at migration gate: 0
- paid cleaner payouts unchanged at 70

## Production UI verification
`/office/payouts`
- Owner-only Payout runs entry visible
- monthly payout model visible
- no Paystack/manual-paid controls exposed

`/office/payout-runs`
- monthly bank-transfer workflow wording verified
- paid state requires bank-transfer reference
- safe workflow visible: freeze -> create run -> approve -> record bank transfers
- production runs reconciled to DB: 3 draft runs and 1 historical paid run
- no freeze/create/approve/settle action was executed during verification

## Safety findings fixed during production review
- multi-key Paystack transfer reconciliation
- explicit live/test mode separation
- provider not-found remains nonterminal
- conclusive Paystack failure statuses converge terminally
- recovered sending leases never auto-resubmit after uncertain verification
- stale/auth/cross-mode sending intents move to reconciliation
- legacy uncertain failed intents are revisited without starving active rows
- bank settlement blocks active/unresolved and legacy-uncertain Paystack intent
- application-layer settlement fence protects deployment order before DB migration
- uncertainty reconciliation is feature-flag independent

## Historical items deliberately not mutated
- Historical cleaner payment-status representation remains outside MASTER-03B; no bulk normalization was performed.
- No cleaner payout/payment history was rewritten during deployment verification.

## Separate defect
A booking-payment replay defect was discovered while reconciling SHL-BK-004366: `provePersistedPaystackReplay()` does not currently exclude `payment_expired`. The individual booking was reconciled only after live Paystack verification and exact ledger proof. This defect is explicitly outside MASTER-03B and should be handled as the next bounded payment-finalization audit item.

## Closeout
MASTER-03B is functionally and financially reconciled in production. This source reconciliation PR copies the final production-reviewed implementation back to `main` so future staging releases cannot regress to the earlier MASTER-03B implementation.
