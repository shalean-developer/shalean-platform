# 12 — R1 Production Readiness (under Release-Control Governance)

Checklist for a **future** controlled production release of R1 (cash SoT / R0).  
This is **not** authorization to release now.

| Field | Value |
|-------|-------|
| **Feature** | R1 — BK-001 / BK-002 / BK-003 cash SoT + R0 settlement |
| **Git SHA (merged)** | `6201e0d27c1d20d7562fb99b44907062f35efc0c` |
| **Migration file** | `20260714140000_bookings_r0_paid_amount_constraint.sql` |
| **Current production traffic** | `dpl_ErXv83…` @ `45ccd98f` (pre-R1 app) |
| **Current production DB** | Pre-R1 (no R0 RPCs / no R1 migration versions) |
| **Staging DB** | R1 present; Git stamp `20260714140000` aligned |
| **Decision now** | **NO-GO for production release** |

---

## A. Release-control preconditions

| # | Item | Status (2026-07-14) |
|---|------|---------------------|
| A1 | Vercel promote-only / non-auto-alias control applied | **PARTIAL** — Option B in repo; **Option A Dashboard proof still open** |
| A2 | GitHub branch protection or rulesets on `main` | **PASS** (ruleset `18942926` + branch protection) |
| A3 | Named rollback operator with team Vercel access | **Partial** |
| A4 | Staging metadata aligned to Git | **PASS** (R1.1A) |
| A5 | No MCP `apply_migration` for R1 on shared envs | **Policy** |
| A6 | Named Release Manager / role holders | **Open** |
| A7 | R1 change-control packet drafted | **Open** |

---

## B. Staging gates

| # | Item | Status |
|---|------|--------|
| B1 | Staging schema has R0 CHECK + RPCs + grants | **PASS** (prior + R1.1) |
| B2 | Staging history has `20260714140000` | **PASS** (re-verified this audit) |
| B3 | Staging app READY at R1 SHA | **PASS** (`dpl_4vNjXo…`) |
| B4 | Staging env binds to staging Supabase | **Re-verify** |
| B5 | DB smoke matrix | **PASS** prior; re-run if data reset |
| B6 | HTTP/admin smoke on staging-bound URL | **Open / incomplete** |
| B7 | CI vitest + migration-governance green | **PASS** |
| B8 | Triage Supabase Preview noise | **Open** |

---

## C. Production database gate

| # | Item | Status |
|---|------|--------|
| C1 | Migration Approval recorded | **Open** |
| C2 | Confirm production still lacks R1 objects | **PASS now** — recheck at T-0 |
| C3 | Apply **only** `20260714140000` via CLI | **Not started** |
| C4 | Post-migrate verification SQL | **Not started** |
| C5 | `schema_migrations` contains `20260714140000` | **Not started** |
| C6 | Do not bundle H02B Model B into R1 unless separately GO | **Constraint** |

**Ordering:** Complete C before D for R1.

---

## D. Production app promote gate

| # | Item | Status |
|---|------|--------|
| D1 | RC for approved SHA READY under promote-only controls | **Open** |
| D2 | Deployment Approval recorded | **Open** |
| D3 | Go / No-Go = GO | **Open** (currently NO-GO) |
| D4 | Explicit promote (not implicit merge) | **Open** |
| D5 | Instant Rollback target | **PASS candidate** `dpl_ErXv83…` |
| D6 | Hostname verify after promote | **Not started** |
| D7 | Production smoke | **Not started** |
| D8 | 24h watch owner | **Open** |

---

## E. Rubric

| Condition | Required for GO |
|-----------|-----------------|
| A1–A4 | Yes |
| B2, B4, B6 | Yes |
| C1–C5 | Yes |
| D1–D5 prepared | Yes |
| Operator available for Instant Rollback | Yes |

**Current result: NO-GO.**

---

## F. Suggested sequence after R1.2X (controls execution)

```text
1. Execute approved Vercel + GitHub controls (separate authorization)
2. Assign named governance roles
3. Finish staging HTTP/admin smoke (B6)
4. Open R1 production change record → Migration Approval
5. Production migrate 20260714140000 only → verify
6. Deployment Approval → promote RC → verify domains + smoke
7. Release Complete
```

Do **not** promote R1 app before R1 migration.

---

## G. Linkage

| Package | Verdict |
|---------|---------|
| R1.1 recovery | CONDITIONAL READY (staging aligned; controls open) |
| **R1.2 governance design** | **READY** (this folder) |
| R1 production release | **NO-GO** until A–D pass |
