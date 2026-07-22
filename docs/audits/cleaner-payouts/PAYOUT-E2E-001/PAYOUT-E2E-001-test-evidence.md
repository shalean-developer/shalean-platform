# PAYOUT-E2E-001 — Test Evidence

## 1. Identity

| Item | Value |
|------|-------|
| Date | 2026-07-20 |
| Repo SHA (workspace) | `3e49bd0941e5f5f5cbdc88e7fa9954c04391e57d` |
| Payout code baseline | `main` @ `f5319b77cd3b74a13afc32891814a083cce6db36` |
| Runner | Vitest via `apps/web` |

## 2. Tests run (unit)

### Command A

```bash
npx vitest run \
  lib/payout/__tests__/adjustBookingPayoutEarnings.test.ts \
  lib/payout/__tests__/adjustBookingTeamMemberPayoutEarnings.test.ts \
  lib/payout/__tests__/removeCleanerFromVisitPayout.test.ts \
  lib/payout/__tests__/patchEarningsSummaryForCleaner.test.ts \
  lib/admin/payouts/__tests__/officeCleanerEditableVisits.test.ts \
  lib/cleaner/__tests__/resolveCleanerEarnings.test.ts \
  lib/payout/__tests__/paystackTransferStatus.idempotency.test.ts \
  lib/payout/__tests__/paystackTransferExecutor.test.ts \
  --reporter=verbose
```

**Result:** 8 files, **27 passed**, 0 failed.

### Command B

```bash
npx vitest run \
  lib/payout/__tests__/pairedRosterPayout.test.ts \
  lib/payout/__tests__/payoutSafetyGuards.test.ts \
  lib/admin/__tests__/officePayoutPeriodReportTeamAllocations.test.ts \
  lib/payout/__tests__/canonicalCleanerPayout.test.ts \
  --reporter=verbose
```

**Result:** 4 files, **24 passed**, 0 failed.

## 3. Classification of coverage

| Area | Unit | Integration | DB | API | E2E | Security | Reconciliation | Failure injection | Concurrency |
|------|------|-------------|----|-----|-----|----------|----------------|-------------------|-------------|
| Cap checks on adjust | Yes | No | No | No | No | No | No | No | No |
| Full solo adjust writer | **No** (stub) | No | No | No | No | No | No | No | No |
| Full team adjust writer | **No** (export only) | No | No | No | No | No | No | No | No |
| Pseudo-team / TJ-only edit | **No** | No | No | No | No | No | No | No | No |
| Office TJ fallback allocation | Yes | No | No | No | No | No | No | No | No |
| Paired roster calc | Yes | No | No | No | No | No | No | No | No |
| Canonical engine | Yes | No | No | No | No | No | No | No | No |
| Outbox / immutable ref | Yes (mocked) | No | No | No | No | No | Partial | Network uncertainty mocked | No |
| Webhook idempotency | Yes (mocked) | No | No | No | No | No | Yes (unit) | Replay unit | No |
| Maker–checker UI false success | No | No | No | No | No | No | No | No | No |
| Dual-rail Paystack | Partial phase15a | No | No | Partial | No | No | Partial | Partial | No |

**Gap verdict:** Existing green unit tests **do not** prove end-to-end visit edit correctness. Per audit rules, multi-system workflows are **not** marked PASS.

## 4. Static reproduction of F02 (no DB write)

Fixture from `officePayoutPeriodReportTeamAllocations.test.ts`:

| Cleaner | Present in summary | Present in TJ | Office cents |
|---------|--------------------|---------------|--------------|
| Lorraine (lead) | Yes @ 27000 | No | from summary resolve |
| Thandeka (member) | **No** | Yes @ 25000 | **25000 from TJ** |

Solo adjust path (`is_team_job = false`) updates booking hybrid / optional summary; **does not** update TJ.

**Predicted outcome of editing Thandeka to 30000 via current API:**

| Step | Result |
|------|--------|
| HTTP | 200 `ok: true` (assuming editable + auth) |
| `team_job_member_payouts.payout_cents` | remains 25000 |
| cleaner-visits reload for Thandeka | still 25000 |
| Toast | success |

This is the confirmed defect class matching the reported symptom.

## 5. Static reproduction of F04 (maker–checker)

When `PAYOUT_MAKER_CHECKER=true` and no `proposal_id`:

```json
{ "ok": true, "requires_approval": true, "proposal_id": "…" }
```

UI:

```ts
if (res.ok) saved += 1;
// … toast Updated N visits
```

**Predicted:** success toast, amounts unchanged until second admin applies.

**Production flag:** not verified (BLOCKED — F16).

## 6. Required reproduction matrix — status

| Case | Status | Notes |
|------|--------|-------|
| Solo unbatched | BLOCKED | Needs staging fixture + admin session |
| Solo pending batch | BLOCKED | |
| Solo frozen batch | BLOCKED | |
| Paired `is_team_job=false` | BLOCKED | Code path reviewed |
| True team job | BLOCKED | |
| Lead edit | BLOCKED | |
| Member edit | BLOCKED | |
| With / without summary | BLOCKED | |
| With / without TJ | **Static PASS (defect)** | Unit fixture + code |
| Approved batch | Code: blocked by guard | Not live-tested |
| Paid booking | Code: blocked by guard | Not live-tested |
| Invalid cleaner | BLOCKED | |
| Amount unchanged | UI toast "No visit earnings were changed" | Code-reviewed |
| Above cap | Unit cap tests PASS | |
| Concurrent edits | BLOCKED | |
| Maker–checker proposal | Static defect F04 | Env unknown |

## 7. Paystack live transfer tests

**Not run** (forbidden without authorization). Outbox unit tests cover immutable reference, insert-before-send, and needs_reconcile on uncertain network.

## 8. Screenshots / API captures

None (no staging browser session authorized for mutation). Production page not exercised with writes.

## 9. Artifacts

- Vitest stdout captured in this audit session (2026-07-20 ~23:25–23:27 SAST)
- No production data exported
- No secrets logged
