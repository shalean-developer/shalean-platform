# 09 — Go / No-Go Checklist

**Use:** Before any production promote  
**Decision owner:** Release Manager  
**Timezone for stamps:** Africa/Johannesburg

---

## 1. Header

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

---

## 2. Control gates

| # | Gate | PASS? |
|---|------|-------|
| G1 | Vercel production auto-alias risk accepted **or** promote-only control live | |
| G2 | GitHub protection/rulesets live **or** Release Manager accepts unprotected merge risk | |
| G3 | Required CI green on release SHA | |
| G4 | Human review recorded for merge | |
| G5 | RC READY; domains still on previous known-good (pre-promote) | |

If G1 fails after controls are supposed to be live → **automatic NO-GO**.

---

## 3. Staging gates

| # | Gate | PASS? |
|---|------|-------|
| S1 | Staging schema matches intended migrations | |
| S2 | Staging `schema_migrations` Git-aligned | |
| S3 | Staging app bound to staging DB | |
| S4 | Staging smoke always-matrix PASS | |
| S5 | Feature-specific staging smoke PASS | |

---

## 4. Migration gates (if schema in scope)

| # | Gate | PASS? / N/A |
|---|------|-------------|
| M1 | Migration Approval signed (DB Owner + Release Manager) | |
| M2 | Production identity re-proofed (`tchaye…`) | |
| M3 | Dry-run pending set matches approval | |
| M4 | Production migrate executed | |
| M5 | Verification SQL PASS | |
| M6 | App promote held until M5 PASS | |

If schema required and any M* fails → **NO-GO** for promote.

---

## 5. Deployment gates

| # | Gate | PASS? |
|---|------|-------|
| D1 | Deployment Approval signed | |
| D2 | Instant Rollback target ID recorded | |
| D3 | Team-scoped operator present | |
| D4 | Monitoring owner present for 60 minutes | |

---

## 6. Risk gates

| # | Gate | PASS? |
|---|------|-------|
| R1 | No unmitigated Critical Risk Register items for this change | |
| R2 | Customer impact window communicated (if needed) | |
| R3 | Emergency contacts reachable | |

---

## 7. Decision

| Outcome | Meaning |
|---------|---------|
| **GO** | Promote may proceed now |
| **NO-GO** | Hold customer traffic; RC may remain for later |
| **GO WITH CONSTRAINTS** | Written constraints mandatory (time box, flags, limited rollout) |

| Field | Value |
|-------|-------|
| Decision | GO / NO-GO / GO WITH CONSTRAINTS |
| Constraints (if any) | |
| Release Manager signature | |
| Timestamp | |

---

## 8. Production Readiness Checklist (generic)

Use alongside feature-specific lists (e.g. [12-r1-production-readiness.md](./12-r1-production-readiness.md)):

- [ ] Scope frozen  
- [ ] RC identified  
- [ ] Staging green  
- [ ] Migrations approved & done (or N/A)  
- [ ] Rollback ready  
- [ ] Smoke owners ready  
- [ ] Go recorded  
- [ ] Promote executed  
- [ ] Prod smoke PASS  
- [ ] Release Complete filed  
