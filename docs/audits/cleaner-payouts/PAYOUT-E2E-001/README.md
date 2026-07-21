# PAYOUT-E2E-001 — Evidence Index

| File | Purpose |
|------|---------|
| [PAYOUT-E2E-001-executive-report.md](./PAYOUT-E2E-001-executive-report.md) | Opinion, score, controls |
| [PAYOUT-E2E-001-architecture.md](./PAYOUT-E2E-001-architecture.md) | Tables, APIs, Mermaid flows |
| [PAYOUT-E2E-001-source-of-truth-matrix.md](./PAYOUT-E2E-001-source-of-truth-matrix.md) | Field winners by state |
| [PAYOUT-E2E-001-findings-register.md](./PAYOUT-E2E-001-findings-register.md) | F01–F20 |
| [PAYOUT-E2E-001-data-integrity.md](./PAYOUT-E2E-001-data-integrity.md) | SQL pack (live counts BLOCKED) |
| [PAYOUT-E2E-001-test-evidence.md](./PAYOUT-E2E-001-test-evidence.md) | Vitest results + static repro |
| [PAYOUT-E2E-001-remediation-plan.md](./PAYOUT-E2E-001-remediation-plan.md) | Phases A–E |
| [PAYOUT-E2E-001-verification-checklist.md](./PAYOUT-E2E-001-verification-checklist.md) | Post-fix gate |

## Session constraints

- No production writes, transfers, approvals, or migrations
- Supabase MCP unavailable → integrity counts blocked
- No application code changed for remediation
