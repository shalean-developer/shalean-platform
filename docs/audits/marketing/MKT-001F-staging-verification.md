# MKT-001F — Staging Verification

**Program:** Marketing Platform Remediation  
**Phase:** MKT-001F — Marketing UX Polish (staging verification)  
**Mode:** Controlled staging verification — **production untouched**  
**Source:** `docs/audits/marketing/MKT-001F-marketing-ux-polish.md`  
**Date:** 2026-07-17 (pre-merge draft; complete after exact-SHA deploy)

---

## 1. Executive decision

**PENDING** — complete after PR merge into `staging` and exact-SHA Vercel deployment.

Production remains **NO-GO** while MKT-001A-PROD is open.

---

## 2. Deployment traceability (fill after merge)

| Item | Value |
|---|---|
| Feature branch | `feature/mkt-001f-marketing-ux-polish` |
| PR | _(fill)_ |
| Merge commit (staging tip) | _(fill)_ |
| Vercel deployment | _(fill)_ |
| Deployment SHA | _(must match merge SHA)_ |
| Ready state | _(fill)_ |
| Staging branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Production / `main` | Must remain untouched |

---

## 3. Local pre-merge gates

| Gate | Status |
|---|---|
| MKT-001F unit tests | **PASS** (11) |
| MKT-001A–E / B.2 focused regression | **PASS** (60 combined in focused run) |
| Typecheck (`apps/web`) | **PASS** |
| ESLint (touched files) | **PASS** (0 errors; pre-existing hook warnings only) |
| Critical tests | **PASS** (134) |
| DB migrations | **N/A** |

---

## 4. Staging verification matrix (post-deploy)

| Scenario | Expected result | Status |
|---|---|---|
| No connected accounts | Helpful empty state and connection path | Pending |
| Healthy provider | Accurate status and available actions | Pending |
| Disabled provider | Clearly unavailable; no publish action | Pending |
| Expired provider | Reconnect guidance | Pending |
| Social post success | Clear success feedback and history entry | Pending |
| Social post failure | Guidance, retry timing, correlation ID | Pending |
| Duplicate click | One logical publish only | Pending |
| Campaign draft | Content preserved; unsaved warning on leave | Pending |
| Campaign validation failure | Field and summary errors | Pending |
| Empty analytics period | No misleading percentage | Pending |
| Intelligence alert | Severity, evidence, action, runbook | Pending |
| Mobile navigation | No overflow or blocked actions | Pending |
| Loading state | Stable, localized, understandable | Pending |
| Keyboard-only workflow | Operable end to end | Pending |
| Screen-reader semantics | Labels and status announcements present | Pending |
| Sensitive data | No tokens, secrets, or raw provider payloads | Pending |

---

## 5. Evidence checklist (post-deploy)

- [ ] Desktop layout screenshots (campaigns, social, accounts, intelligence)
- [ ] Mobile layout screenshots (≤430px) — no horizontal page scroll
- [ ] Connected Accounts state examples (connected / stub / degraded)
- [ ] Social Posts composer + disabled publish when unconfigured
- [ ] Campaign Builder dirty-form warning
- [ ] Analytics / intelligence empty or zero-sample display (“—”)
- [ ] Failure toast with correlation ID (sanitized)
- [ ] Keyboard tab order through hub sub-nav and publish controls
- [ ] Exact staging deployment SHA recorded above

---

## 6. Final decision (post-deploy)

| Gate | Result |
|---|---|
| Exact SHA deployed to staging | Pending |
| Matrix pass | Pending |
| Production untouched | Required |
| Phase complete | Pending |

**Authorized next step after PASS:** close MKT-001F staging verification only. Do not promote to `main` / production.
