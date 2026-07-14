# Go / No-Go decision packet template

Complete before any production promote. Decision owner: **Release Manager**.

| Field | Value |
|-------|-------|
| Change ID | |
| Title | |
| Git SHA | |
| RC deployment ID | |
| Staging deployment ID | |
| Migrations in scope | versions / N/A |
| Release Manager | |
| Database Owner | |
| Engineering Owner | |
| Operations Owner | |
| Decision window start | |

## Control gates

| # | Gate | PASS? |
|---|------|-------|
| G1 | Vercel auto-alias disabled **or** staged promote-only live | |
| G2 | GitHub protection/rulesets live on `main` | |
| G3 | Required CI green (`vitest`, `validate-migration-filenames`) | |
| G4 | Human review recorded (or sole-owner compensating control documented) | |
| G5 | RC READY; customer domains still on known-good pre-promote | |

## Staging gates

| # | Gate | PASS? |
|---|------|-------|
| S1 | Staging schema matches intended migrations | |
| S2 | Staging `schema_migrations` Git-aligned | |
| S3 | Staging app bound to staging DB (`gfvdic…`) | |
| S4 | Staging smoke always-matrix PASS | |
| S5 | Feature-specific staging smoke PASS | |

## Migration gates (if schema in scope)

| # | Gate | PASS? / N/A |
|---|------|-------------|
| M1 | Migration Approval signed (DB Owner + Release Manager) | |
| M2 | Production identity re-proofed (`tchaye…`) | |
| M3 | Dry-run pending set matches approval | |
| M4 | Production migrate executed | |
| M5 | Verification SQL PASS | |
| M6 | App promote held until M5 PASS | |

## Deployment gates

| # | Gate | PASS? |
|---|------|-------|
| D1 | Deployment Approval signed | |
| D2 | Instant Rollback target ID recorded | |
| D3 | Team-scoped Vercel operator present (`shalean-cleaning-services`) | |
| D4 | Monitoring owner present for 60 minutes | |

## Decision

| Field | Value |
|-------|-------|
| Decision | GO / NO-GO / GO WITH CONSTRAINTS |
| Constraints | |
| Release Manager signature | |
| Timestamp (Africa/Johannesburg) | |
