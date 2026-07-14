# 05 — Release Governance Standard

**Status:** Active SEOS standard (R1.2X platform controls implemented — see [13-r1-2x-implementation-report.md](./13-r1-2x-implementation-report.md))  
**Applies to:** All production-impacting releases for `shalean-platform`

---

## 1. Purpose

Guarantee:

- Code merge ≠ production release  
- Production deployment requires explicit approval  
- Production migration requires explicit approval  
- Rollback ownership is defined  
- Smoke testing is mandatory  
- Go / No-Go is documented  
- Customer domains move only after approvals succeed  

---

## 2. Canonical workflow

```text
Developer Branch
        ↓
Pull Request
        ↓
Code Review
        ↓
Required CI
        ↓
Merge to Main
        ↓
Release Candidate (build; no customer domains)
        ↓
Staging Deployment
        ↓
Staging Migration
        ↓
Smoke Tests (staging)
        ↓
Business Go / No-Go
        ↓
Production Migration (if required; dual-approved)
        ↓
Explicit Production Promotion
        ↓
Production Smoke Tests
        ↓
Release Complete
```

**Invariant:** Customer domains must not move before migration success (when schema required), smoke success, and production approval.

---

## 3. Stage definitions

| Stage | Meaning | Exit criteria |
|-------|---------|---------------|
| Developer Branch | Isolated work | Migrations via `supabase migration new`; local validate |
| Pull Request | Peer review surface | Diff complete; description includes risk + migration note |
| Code Review | Human acceptance | ≥ required approvals |
| Required CI | Automated quality | Required checks green |
| Merge to Main | Integration only | RC eligible; **not** customer release |
| Release Candidate | Built artifact | Deployment READY; SHA recorded; domains unchanged |
| Staging Deployment | Non-prod app | Bound to staging Supabase |
| Staging Migration | Schema soak | Git stamps applied; history aligned |
| Staging Smoke | Confidence | Smoke standard pass |
| Go / No-Go | Business decision | Recorded GO / NO-GO / GO WITH CONSTRAINTS |
| Production Migration | Schema change | Migration Approval executed + verified |
| Production Promotion | Domain move | Deployment Approval + promote |
| Production Smoke | Live verify | Smoke standard pass |
| Release Complete | Closeout | Evidence pack filed; 24h owner named |

---

## 4. Governance roles

### Release Manager

Responsible for:

- Go / No-Go decision  
- Deployment Approval  
- Authorization to promote / Instant Rollback  
- Release evidence closeout  

### Database Owner

Responsible for:

- Migration Approval  
- Migration execution (CLI Git stamps)  
- History repair when authorized  
- Rollback readiness for DB (stop conditions, backup exception awareness)  
- Wrong-target prevention (ref identity proof)  

### Engineering Owner

Responsible for:

- Code quality and PR completeness  
- CI green / required checks  
- Release Candidate readiness (SHA, scope, flags)  
- Schema↔app compatibility statement  

### Operations Owner

Responsible for:

- Staging and production smoke execution  
- Monitoring during and after promote  
- Incident detection handoff  
- Post-promote watch (minimum 24h named)  

**Rule:** “Whoever merged” is never an acceptable production promote or rollback owner.

---

## 5. Approval objects

| Object | Authorizes | Does not authorize |
|--------|------------|--------------------|
| RC ready | Use of a built SHA/deploy as candidate | Domain move |
| Migration Approval | Production DB change | Domain move |
| Go / No-Go | Proceed toward promote | Implicit promote |
| Deployment Approval | Promote / alias assignment | Future merges |

Ordering when schema changes:

```text
Migration Approval → migrate → verify DB
        → Deployment Approval → promote → verify app
```

---

## 6. Anti-patterns (banned)

1. Merge to `main` expecting “migrate later” while feature is already customer-visible  
2. MCP `apply_migration` on shared staging/production for governed releases  
3. Dashboard-only DDL  
4. Declaring rollback complete without hostname → deployment ID verification  
5. Using personal Vercel scope for team production actions  
6. Re-running SQL to “fix” history skew when metadata repair is required  
7. Renaming migration files after any shared env applied a different stamp  

---

## 7. Interim policy while Option A proof is pending

GitHub protection/rulesets are **live**. Repo Option B (`github.autoAlias: false`) is **in tree**. Until a `shalean-cleaning-services` admin confirms Vercel Option A (Auto-assign Custom Production Domains = Off):

1. Treat the first post-merge production-targeted deploy as a **domain-move verification drill** — Instant Rollback if domains move unexpectedly.  
2. Prefer feature-branch + preview for ordinary work.  
3. Emergency merges still require pre-staged Instant Rollback target and a live team-authenticated operator.  
4. Do **not** promote R1 until Option A proof is filed in the R1.3 packet.

---

## 8. Related standards

- [06-production-deployment-standard.md](./06-production-deployment-standard.md)  
- [07-production-migration-standard.md](./07-production-migration-standard.md)  
- [08-production-smoke-standard.md](./08-production-smoke-standard.md)  
- [09-go-no-go-checklist.md](./09-go-no-go-checklist.md)  
- [10-release-approval-matrix.md](./10-release-approval-matrix.md)  
- [11-rollback-runbook.md](./11-rollback-runbook.md)  
