# PAYOUT-OPS-001 — Test plan

| Field | Value |
|-------|-------|
| **Work package** | PAYOUT-OPS-001 |
| **Status** | Implementation-ready matrix — tests not executed in this analysis |

Legend: U = Unit · I = API/integration · D = DB/transaction · C = UI component · E = E2E · S = Security

---

## 1. Control & queue behaviour

| # | Case | Layers | Expected |
|---|------|--------|----------|
| T01 | Proposal appears in pending list | I, E | After propose, GET list includes row with correct amounts |
| T02 | Original amount unchanged after propose | I, E, D | Booking/TJ earnings unchanged; Office reload shows original |
| T03 | Proposer cannot approve own proposal | I, S, E | 409 `maker_checker_self_approve`; earnings unchanged |
| T04 | Second admin can approve | I, E | 200 applied; earnings = proposed; status approved |
| T05 | Second admin can reject | I, E | 200 rejected; earnings unchanged; `review_note` set |
| T06 | Approved earnings update once | I, D | Single writer effect; second approve 409; amounts stable |
| T07 | Rejected earnings never update | I, D | Writers not called / amounts equal pre-reject |
| T08 | Refresh preserves canonical amount (pending) | E | Matches Phase A PASS |
| T09 | Duplicate approve harmless | I, D | First success; second 409; no double delta |
| T10 | Duplicate reject harmless | I | First success; second 409 |
| T11 | Concurrent approve safe | I, D | Exactly one apply; one approved; other 409 |
| T12 | Unauthorized cannot view | S, I | 401/403 on list |
| T13 | Unauthorized cannot approve/reject | S, I | 401/403 |
| T14 | Processed leave pending queue | I, C, E | Default pending filter excludes approved/rejected |
| T15 | Audit has proposer + checker | I, D | Proposal row + `payout_audit_events` actor on apply; reviewed_by set |
| T16 | Refund workflow unaffected | I, E | Refund propose/approve still works |
| T17 | `PAYOUT_MAKER_CHECKER=true` enforced | U, I, S | Propose path when flag true; no client bypass |

---

## 2. Hardening-specific

| # | Case | Layers | Expected |
|---|------|--------|----------|
| T18 | Approve ignores body amounts | I, S | POST approve with no/wrong amounts still applies payload |
| T19 | Legacy PATCH approve with mismatched body | I, S | 409 mismatch **or** payload-only apply (chosen contract) |
| T20 | Expired proposal | I | 409 `proposal_expired`; status expired; no mutate |
| T21 | Reject requires reason | I, C | 400 if empty `review_note` |
| T22 | Self row actions disabled in UI | C | Approve/Reject not actionable for proposer |
| T23 | Stale modal after concurrent process | C, E | Error toast; list refresh shows processed status |

---

## 3. Layer notes

### Unit
- Flag parsing helpers; payload parse; `can_review` pure logic; difference_cents formatting.

### API / server-action integration
- Mock or staging Supabase: propose → list → approve/reject matrix (T01–T14, T18–T21).
- Extend patterns from `payoutE2e001PhaseA.staging.verify.test.ts` and `payoutSafetyGuards.test.ts`.

### Database / transaction
- Concurrent approve race harness (two parallel POSTs).
- Assert single earnings delta and single `approved` row.

### UI component
- Table empty/loading; filter chips; modal confirm; self-disable; toast copy with link.

### End-to-end
- Staging Office: Admin A propose → Admin B approve via Approvals page → amounts update → reload.
- Admin A propose → Admin B reject → amounts unchanged.
- Refund dialog smoke after deploy.

### Security / authorization
- Missing Bearer; non-allowlisted user; self-approve; enumeration limited to admins.

---

## 4. Regression anchors (must remain green)

- Phase A: propose does not mutate; locked batch reject; classifier routing.
- `PAYOUT_ALLOW_SELF_APPROVE` remains unset/false in staging evidence.
- Expense approve/reject pages unaffected.
