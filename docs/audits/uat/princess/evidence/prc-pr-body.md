# PRINCESS PR C — PR body draft

## Summary

- Audits and hardens Paystack webhook integrity: strict signature rejection, reference-keyed idempotency, amount/currency/booking mismatch gates, and safe structured observability.
- Adds deterministic Princess PR C webhook contract + callback/webhook ordering tests (wired into `test:critical`).
- Staging probe confirms signature rejection, unknown-event ack, and webhook replay settle-once (ledger not duplicated). Production untouched.

## Test plan

- [x] Local: PR C webhook + ordering tests
- [x] Local: `npm run test:critical`
- [x] Local: full Vitest
- [x] Local: typecheck / lint:booking-core / migration validate / next build --webpack
- [x] Staging: signature reject + replay already-paid (see `docs/audits/uat/princess/10-prc-payment-webhook-integrity.md`)
- [ ] Post-merge: re-run staging probe + one fresh synthetic charge (Princess checklist)
