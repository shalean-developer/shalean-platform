# PAYOUT-OPS-001 — Changed file inventory

## Application

| Path | Change |
|------|--------|
| `supabase/migrations/20260721120000_payout_ops_001_money_action_proposal_claim.sql` | Added |
| `apps/web/lib/payout/moneyActionProposalTypes.ts` | Added |
| `apps/web/lib/payout/moneyActionProposalPayload.ts` | Added |
| `apps/web/lib/payout/claimMoneyActionProposal.ts` | Added |
| `apps/web/lib/payout/approveMoneyActionProposal.ts` | Added |
| `apps/web/lib/payout/rejectMoneyActionProposal.ts` | Added |
| `apps/web/lib/payout/listMoneyActionProposals.ts` | Added |
| `apps/web/lib/payout/earningsAdjustMakerChecker.ts` | Hardened (claim, duplicate, immutable approve) |
| `apps/web/lib/payout/payoutAudit.ts` | Reject event type |
| `apps/web/app/api/admin/money-action-proposals/route.ts` | Added list |
| `apps/web/app/api/admin/money-action-proposals/[id]/route.ts` | Added detail |
| `apps/web/app/api/admin/money-action-proposals/[id]/approve/route.ts` | Added |
| `apps/web/app/api/admin/money-action-proposals/[id]/reject/route.ts` | Added |
| `apps/web/app/api/admin/bookings/[id]/adjust-payout-earnings/route.ts` | Snapshot + legacy approve harden |
| `apps/web/app/(ui-redesign)/office/payouts/approvals/page.tsx` | Added |
| `apps/web/app/(ui-redesign)/office/payouts/approvals/OfficePayoutApprovalsClient.tsx` | Added |
| `apps/web/app/(ui-redesign)/office/payouts/page.tsx` | Approvals link |
| `apps/web/src/features/office/OfficeNav.tsx` | Nav item |
| `apps/web/components/admin/office/OfficeCleanerEarningsEditPanel.tsx` | Deep-link toast |
| `apps/web/components/admin/office/OfficePayoutDetailPanel.tsx` | Pending-approval aware |
| `apps/web/lib/payout/__tests__/payoutOps001Approvals.test.ts` | Added |
| `scripts/env/payout-ops-001-staging-verify.mjs` | Added |

## Documentation (this package)

See `docs/audits/cleaner-payouts/PAYOUT-OPS-001/*` including planning artefacts and evidence updates.
