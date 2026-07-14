# 06 — Production Deployment Standard

**Status:** Active standard (R1.2X — Option B in repo; Option A Dashboard confirmation still required)  
**Scope:** Customer-visible Vercel production alias moves for `shalean-platform`

---

## 1. Principle

Production deployment is an **explicit promote** of a Release Candidate, never a side effect of Git merge.

---

## 2. Preconditions

Before Deployment Approval:

| # | Precondition |
|---|--------------|
| 1 | RC deployment READY at approved SHA |
| 2 | Staging smoke passed against staging-bound env |
| 3 | Go / No-Go = GO (or GO WITH CONSTRAINTS with written limits) |
| 4 | If schema required: Migration Approval executed + verified |
| 5 | Instant Rollback target deployment ID recorded |
| 6 | Release Manager + Operations Owner available during promote window |
| 7 | Operator authenticated to `shalean-cleaning-services` team scope |

---

## 3. Deployment Approval packet (minimum)

| Field | Required |
|-------|----------|
| Change ID | Yes |
| Git SHA | Yes |
| RC deployment ID / URL | Yes |
| Migration status | Done / N/A / Blocked |
| Go result | GO / … |
| Rollback deployment ID | Yes |
| Approver (Release Manager) | Yes |
| Timestamp (Africa/Johannesburg) | Yes |

---

## 4. Promote procedure

1. Confirm domains currently point at known-good deploy (pre-check).  
2. Execute promote (Dashboard → Promote **or** team-scoped CLI).  
3. Immediately verify:

   - `shalean.co.za` → expected `dpl_…`  
   - Deployment SHA == approved SHA  
4. Run production smoke ([08-production-smoke-standard.md](./08-production-smoke-standard.md)).  
5. On any always-check failure → Rollback Decision ([11-rollback-runbook.md](./11-rollback-runbook.md)).  
6. File Release Complete note.

### Example CLI (post-approval only)

```bash
vercel promote <rc-deployment-id-or-url> -S shalean-cleaning-services --yes
```

---

## 5. Forbidden actions

| Action | Why forbidden |
|--------|---------------|
| Rely on merge to `main` to move domains | Root-cause defect |
| Promote without Migration Approval when schema required | R1 failure mode |
| Promote with personal Vercel scope | Wrong-team risk |
| Skip hostname verification | False “success” |
| Hot-patch production by force-push | Bypasses RC + approvals |

---

## 6. Platform control requirements

| Control | R1.2X status |
|---------|--------------|
| GitHub protect `main` | **Live** |
| Option B `github.autoAlias: false` | **In `apps/web/vercel.json`** |
| Option A auto-assign custom production domains Off | **Pending team-admin Dashboard/API** |

Record Option A proof before any intentional production promote. See [13-r1-2x-implementation-report.md](./13-r1-2x-implementation-report.md).

---

## 7. Emergency deployment

See Emergency Release Standard section in [10-release-approval-matrix.md](./10-release-approval-matrix.md) and [11-rollback-runbook.md](./11-rollback-runbook.md).

Emergency still requires:

- Named Incident Commander / Release Manager  
- Pre-declared rollback target  
- Post-incident evidence pack within 24h  
