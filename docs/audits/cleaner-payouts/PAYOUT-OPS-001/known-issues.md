# PAYOUT-OPS-001 — Known issues

| ID | Severity | Issue | Impact | Disposition |
|----|----------|-------|--------|-------------|
| KI-OPS-001 | Medium (evidence) | Successful `visit_earnings_adjusted` audit from approve path omits `context.proposal_id` / maker | PASS checklist wants proposal id on audit row; proposal table still has maker/checker | Remediations: pass `proposal_id` + `proposed_by` into `requireVisitEarningsAdjustAudit` / approve apply audit |
| KI-OPS-002 | Low (path residual) | Team-job propose path can still snapshot `original_total_cents` as `0` | TJ UI may show `R 0 → R n` | **Verified 2026-07-21:** operator solo proposal `4db13e7e-…` **PASS** (`original_total_cents=30000` matches canonical). Residual: TJ fixtures still often `0` — see `evidence/ki-ops-002-003-verification-2026-07-21.md` |
| KI-OPS-003 | Medium (audit) | Idempotent / concurrent reject still inserts extra `visit_earnings_adjustment_rejected` rows | Duplicate audit noise; proposal + earnings remain correct | **REMEDIATED 2026-07-21:** sequential/concurrent/multi each produce **1** reject audit. Design: audit only when RPC `transition_applied=true` + unique `vea_rejected:<proposal_id>` reference index. Prior FAIL preserved in `evidence/ki-ops-002-003-verification-2026-07-21.md`; remediation in `evidence/ki-ops-003-remediation-2026-07-21.md` |
| KI-OPS-004 | Info | Preview deploy SHA `a533794…` vs PR head `14586e74…` | Docs-only delta after deploy | Redeploy optional before production gate |
| KI-OPS-005 | Info | Empty-state copy always says “No pending…” even when filter ≠ pending | Cosmetic | Optional UI copy fix |

None of the above disable maker–checker, allow self-approve, or permit body-tampered approve.
