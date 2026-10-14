# AUDIT-03C-01 — Permanent cleaner payment IDs

Owner decision, 14 October 2026: defer pre-October historical settlement reconstruction; establish controlled October onwards payouts and permanent cleaner IDs. Historical deferral is not forgiveness, payment proof, or stage closure. No historical earnings/settlement mutation is authorized by this change.

This first bounded change allocates permanent SHL-CL-000001 identities for every cleaner, including inactive records, ordered by created_at and UUID for initial allocation. Later inserts use a non-cycling sequence; callers cannot supply their own ID and updates cannot change it. IDs never reuse a departed cleaner's identity. No bank account values are included in the identity. A separate verified beneficiary mapping is still required.

Payout CSV includes cleaner_payment_id and suggested_bank_reference (for example SHL-CL-000001-202610, 20 characters). The suggestion is separate from the actual recorded transfer reference and does not mark the batch paid. Existing UUID and bank masks remain available.

Audit: production currently has 34 cleaners and no permanent payment ID column. Nyasha Mudani and Nyaradzai Mundicha are distinct identities. October completed booking rows total 73 (two eligible, 71 pending); their booking total is not an approved payout amount and excludes participant-level reconciliation.

## Gates

- Focused reference tests, critical suite and migration filename validation required.
- Database proof required in a rolled-back isolated/staging transaction: unique initial IDs; supplied-ID insert rejected; ID mutation rejected; normal profile update allowed; new identity allocates next number; direct trigger function execution denied; financial records unchanged.
- Staging deployment uses normal automatic branch workflow. Migration precedes application verification. Export must show exact linked cleaner identity and unchanged payout cents.
- Production promotion only after CI/review and staging proof; additive migration first, then bounded application release. Reconcile all cleaner IDs and unchanged financial control totals.
- Rollback application to previous SHA; keep allocated IDs/schema. Never drop/reassign IDs after operational use.

## Following bounded gate

AUDIT-03C-02 must enforce the 1 October cutoff across generation, catch-up, legacy preflight, direct/roster/team rails, approval, payout-run creation, append and manual bank settlement. July monthly-model epoch remains historical truth; do not redefine it to October or hide paid history. Pre-October items remain preserved, explicitly deferred and excluded from automatic processing. This PR does not implement that exclusion.

Full October calendar-month payout cannot be approved before 1 November 2026 Johannesburg under the existing month-close rule. Beneficiaries and October booking-level allocations must be verified before payment. Bank transfer execution remains manual.

Status: staging database proofs and live per-payout export verification PASS on release e40ffccf32a77026484e7194f1c90bdc87fe2fd5. September approved fixture exported exact 123.45, SHL-CL-000001 and SHL-CL-000001-202609 (user-supplied CSV parsed and asserted). August pending and October open-month exports blocked with the closed/approved requirement (owner-reported live UI results). All three disposable staging payout rows removed; remaining payout count zero. Production release prepared from 1c608730358aafae4767efcc3b48d607d278570b with only this stage's ten files; production CI/review, migration, automatic deployment and reconciliation remain pending. No IDs allocated in production. Historical AUDIT-03A-02B.3 remains deferred, not PASS. October payout stage remains open.
