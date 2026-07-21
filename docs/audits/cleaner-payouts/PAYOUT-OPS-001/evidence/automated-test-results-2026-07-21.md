# PAYOUT-OPS-001 — Automated test results (2026-07-21)

## Commands

```bash
cd apps/web
npx vitest run lib/payout/__tests__/payoutOps001Approvals.test.ts
npx vitest run lib/booking/refund/__tests__/princessPrdRefundContract.test.ts lib/payout/__tests__/payoutSafetyGuards.test.ts
```

## Results

| Suite | Result |
|-------|--------|
| `payoutOps001Approvals.test.ts` | **11/11 passed** |
| `princessPrdRefundContract.test.ts` | **29/29 passed** (refund regression) |
| `payoutSafetyGuards.test.ts` | **2/2 passed** |

## Matrix coverage (unit / mocked integration)

| ID | Case | Covered? |
|----|------|----------|
| T03 | Self-approve blocked | Yes (mock) |
| T05 | Reject + audit | Yes (mock) |
| T07 | Reject no mutate | Yes (mock) |
| T09 | Duplicate approve idempotent | Yes (mock) |
| T17 | Flag enforcement | Yes |
| T18 | Stored-payload-only apply | Yes (mock) |
| T21 | Malformed / short reject note | Yes |
| T01 duplicate propose | Yes (mock) |
| T11 concurrent race | **Pending** staging RPC |
| T16 refund unaffected | Yes (regression suite) |
| E2E Office two-admin | **Pending** Preview + staging migration |

## Concurrency

Live concurrent approve/reject race evidence requires staging migration + harness. Design uses conditional RPC claim so exactly one winner; unit coverage of the claim contract is via mock codes pending live RPC.
