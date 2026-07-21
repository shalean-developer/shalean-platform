# PAYOUT-OPS-001 — Implementation plan

| Field | Value |
|-------|-------|
| **Work package** | PAYOUT-OPS-001 |
| **Authority** | Phased plan only — **do not implement** until separately authorized |

Prerequisite: implementation authorization explicitly grants code + optional index migration; **does not** authorize production deploy or flag changes.

---

## Phase 1 — Repository and control verification

| | |
|--|--|
| **Scope** | Reconfirm flag state, proposal table, self-approve off, Phase A evidence still valid |
| **Files** | Docs only / read-only probes (no mutations) |
| **Dependencies** | Staging access if re-verify |
| **Risks** | Env drift |
| **Tests** | Checklist against Phase A matrix |
| **Acceptance** | `PAYOUT_MAKER_CHECKER=true` recorded; no self-approve; propose still non-mutating |
| **Rollback** | N/A |

---

## Phase 2 — Read-only pending-proposals query

| | |
|--|--|
| **Scope** | Server list (+ optional detail) of `admin_money_action_proposals` with joins for cleaner/booking labels; enrich propose payload snapshot if touching propose path |
| **Files likely** | `apps/web/lib/payout/listMoneyActionProposals.ts` (new), `apps/web/app/api/admin/money-action-proposals/route.ts` (new), optionally propose path in `adjust-payout-earnings/route.ts` / maker-checker insert payload |
| **Dependencies** | Phase 1 |
| **Risks** | N+1 joins; missing index on large tables |
| **Tests** | I: T01, T12; pagination filters |
| **Acceptance** | Authenticated admin can list pending with required fields; non-admin denied |
| **Rollback** | Remove route/lib; no schema dependency if payload-only |

---

## Phase 3 — Office pending-approvals UI

| | |
|--|--|
| **Scope** | `/office/payouts/approvals` page, nav link, filters, empty/loading/unauthorized, deep link from toast |
| **Files likely** | `apps/web/app/(ui-redesign)/office/payouts/approvals/page.tsx`, `OfficeMoneyActionApprovals*.tsx`, `OfficeNav.tsx`, `OfficeCleanerEarningsEditPanel.tsx` (toast link + show proposal_id) |
| **Dependencies** | Phase 2 |
| **Risks** | UI shows proposed as applied (must not) |
| **Tests** | C/E: empty, loading, list render, self-disable |
| **Acceptance** | Second admin sees pending queue; proposer sees own rows without approve |
| **Rollback** | Remove page + nav; toast revert |

---

## Phase 4 — Approve and reject integration (+ hardening)

| | |
|--|--|
| **Scope** | Approve/reject APIs with atomic claim; apply **stored payload**; harden legacy PATCH approve path; confirmation modals wired |
| **Files likely** | `earningsAdjustMakerChecker.ts`, new `approveMoneyActionProposal.ts` / `rejectMoneyActionProposal.ts`, `money-action-proposals/[id]/approve|reject/route.ts`, `adjust-payout-earnings/route.ts` |
| **Dependencies** | Phases 2–3 |
| **Risks** | Apply failure after claim; double-write; amount mismatch regressions |
| **Tests** | T03–T11, T18–T21, concurrent D tests |
| **Acceptance** | SEC-OPS-001 and SEC-OPS-002 closed; reject works; earnings rules preserved |
| **Rollback** | Feature-flag UI off (not `PAYOUT_MAKER_CHECKER`); revert routes; leave proposals intact |

---

## Phase 5 — Audit-log and notification completion

| | |
|--|--|
| **Scope** | Ensure proposal_id on apply audit context; optional propose audit event; optional email to proposer |
| **Files likely** | `requireVisitEarningsAdjustAudit.ts`, notify helper (expense email pattern) |
| **Dependencies** | Phase 4 |
| **Risks** | Notification noise |
| **Tests** | T15 |
| **Acceptance** | Checker + proposer identities recoverable from DB/audit |
| **Rollback** | Disable notify only |

---

## Phase 6 — Automated testing

| | |
|--|--|
| **Scope** | Unit + integration + concurrency + UI tests per `test-plan.md` |
| **Files likely** | `apps/web/lib/payout/__tests__/*`, component tests |
| **Dependencies** | Phases 2–5 |
| **Risks** | Flaky concurrency |
| **Tests** | Full matrix T01–T23 as applicable |
| **Acceptance** | CI green on package tests |
| **Rollback** | N/A |

---

## Phase 7 — Staging verification

| | |
|--|--|
| **Scope** | Two-admin live Office flow on Preview/staging; refund smoke; flag remains true |
| **Files** | Evidence under `evidence/` |
| **Dependencies** | Phase 6 + deploy of authorized PR to Preview |
| **Risks** | Single-admin staging; clock skew on expiry |
| **Tests** | E2E T01–T08, T14–T17 |
| **Acceptance** | Signed staging verification note |
| **Rollback** | Do not promote |

---

## Phase 8 — Governance evidence and production-readiness review

| | |
|--|--|
| **Scope** | Update README gates; security residual; decide production authorization **separately** |
| **Files** | `README.md`, `evidence/index.md`, decision log |
| **Dependencies** | Phase 7 PASS |
| **Risks** | Premature production pressure |
| **Tests** | Governance checklist |
| **Acceptance** | Explicit production decision document (out of this analysis) |
| **Rollback** | Remain CONDITIONAL / not authorized |

---

## Cross-cutting

- **Never** set `PAYOUT_MAKER_CHECKER=false` to “unblock” ops.
- **Never** set `PAYOUT_ALLOW_SELF_APPROVE=true` in this package.
- Refund and expense workflows: regression only; no intentional changes.
