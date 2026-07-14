# Release-Control Hardening

| Field | Value |
|-------|-------|
| **Design package** | R1.2 — READY (2026-07-14) |
| **Implementation package** | R1.2X — see [13-r1-2x-implementation-report.md](./13-r1-2x-implementation-report.md) |
| **Implementation decision** | **CONDITIONAL PASS** (Option A Dashboard proof + named roles still required before R1.3) |
| **Git `main` tip (pre-governance merge)** | `6201e0d27c1d20d7562fb99b44907062f35efc0c` |
| **Production traffic** | `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` @ `45ccd98f` |
| **Production DB** | Pre-R1 |

---

## Purpose

Permanently eliminate the release-process weakness that allowed a merge to `main` to become customer-visible before production approval and before the required database migration.

```text
Code merge ≠ Production release
Production deployment requires explicit approval
Production migration requires explicit approval
Customer domains move only after migration + smoke + Go
```

---

## Package contents

| Doc | Contents |
|-----|----------|
| [01-github-governance-audit.md](./01-github-governance-audit.md) | Branch protection, rulesets, merge policy (design audit) |
| [02-vercel-governance-audit.md](./02-vercel-governance-audit.md) | Why auto-deploy happened; Options A/B/C |
| [03-supabase-governance-audit.md](./03-supabase-governance-audit.md) | Migration gate, PITR, ownership |
| [04-cicd-governance-audit.md](./04-cicd-governance-audit.md) | Actions, missing gates, evidence gaps |
| [05-release-governance-standard.md](./05-release-governance-standard.md) | Permanent workflow + roles |
| [06-production-deployment-standard.md](./06-production-deployment-standard.md) | Explicit promote rules |
| [07-production-migration-standard.md](./07-production-migration-standard.md) | Independent migration approval |
| [08-production-smoke-standard.md](./08-production-smoke-standard.md) | Mandatory smoke matrices |
| [09-go-no-go-checklist.md](./09-go-no-go-checklist.md) | Go / No-Go decision packet |
| [10-release-approval-matrix.md](./10-release-approval-matrix.md) | Who approves what |
| [11-rollback-runbook.md](./11-rollback-runbook.md) | Instant Rollback + verification |
| [12-r1-production-readiness.md](./12-r1-production-readiness.md) | R1-specific readiness |
| [13-r1-2x-implementation-report.md](./13-r1-2x-implementation-report.md) | **R1.2X implementation + decision** |
| [14-supabase-operational-checklists.md](./14-supabase-operational-checklists.md) | Prod migration / PITR / rollback ops |
| [15-production-release-checklist.md](./15-production-release-checklist.md) | Updated production release checklist |
| [templates/](./templates/) | Go, migrate, deploy, evidence, incident templates |

---

## Authorized sequence

```text
✅ R1.1A — Staging Migration Metadata Reconciliation
✅ R1.2 — Release-Control Hardening (design)
✅ R1.2X — Execute approved platform controls (this implementation)
⏳ R1.3 — Controlled Production Release (separate authorization)
⏳ Close R1
⏳ Resume Phase 2 Remediation
```

---

## Stop conditions (R1.2X)

- No R1 production release
- No production migration
- No intentional production promote of R1
- No application business-logic changes
