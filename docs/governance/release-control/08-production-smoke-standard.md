# 08 — Production Smoke Test Standard

**Status:** Active design standard  
**Owners:** Operations Owner (execution), Engineering Owner (feature-specific cases)

---

## 1. Principle

Smoke tests are **mandatory** before Go (staging) and immediately after promote (production).  
A release is not complete until production smoke passes and is recorded.

---

## 2. Always matrix (non-destructive)

Run against the environment under test:

| # | Check | Pass criteria |
|---|-------|---------------|
| S1 | `/` | HTTP 200 (or approved redirect) |
| S2 | `/book` | Renders booking entry |
| S3 | `/account` | Auth gate behaves; no 5xx |
| S4 | `/office` | Admin gate behaves; no 5xx |
| S5 | `/api/health` (or agreed health endpoint) | Healthy |
| S6 | Hostname → deployment ID | Matches expected `dpl_…` |
| S7 | Deployment SHA | Matches approved release SHA |
| S8 | Error glance | No new error spike in Vercel production logs since promote |

Any always-check failure → **Rollback Decision**.

---

## 3. Staging-specific additions

| # | Check |
|---|-------|
| ST1 | Env points at staging Supabase (`gfvdic…`), not production |
| ST2 | Feature flags / secrets are staging values |
| ST3 | Migration-specific synthetic cases for the release |
| ST4 | Admin critical path if roles/grants touched |

---

## 4. Production-specific additions

| # | Check |
|---|-------|
| P1 | Customer domains on approved deploy |
| P2 | One canary business path proving the release intent |
| P3 | If migrated: `schema_migrations` + object checks already PASS |
| P4 | Payment / booking paths non-destructive probe only unless explicitly approved |

---

## 5. R1-class feature matrix (example)

When releasing R1 cash SoT / R0:

- Unpaid cash columns preserved  
- R0 settle success path  
- R0 fail path  
- Idempotent settle  
- Equipment cash preserve  
- Constraint gate for invalid paid states  

Re-run on staging before Go; selective canary on production only after migration verified.

---

## 6. Evidence

Record for each smoke run:

| Field | Value |
|-------|-------|
| Environment | staging / production |
| Base URL | |
| Expected `dpl_…` | |
| Expected SHA | |
| Operator | Operations Owner |
| Start/end time | Africa/Johannesburg |
| Results per check | PASS/FAIL + notes |
| Decision | Proceed / Rollback |

---

## 7. Monitoring after GO

| Window | Owner |
|--------|-------|
| First 60 minutes | Operations Owner online |
| First 24 hours | Named watch owner |

Escalate per [Incident Escalation](./10-release-approval-matrix.md#incident-escalation-matrix).
