# H02B Production Smoke-Test Matrix

**Status:** PENDING — smoke ST owners and fixtures not assigned (H02B execution/verification roles are recorded in change-control; do not invent ST owners here)  
**Updated:** 2026-07-14T16:50:00+02:00 (Africa/Johannesburg)  
**Environment:** Production (`shalean-platform` / `tchaye****xlvfu`)  
**Rule:** Do not mark smoke readiness PASS while any mandatory owner or fixture is missing.  
**Secrets:** Never record passwords, API keys, session tokens, or full PII in evidence.

```text
SMOKE MATRIX IS READINESS DOCUMENTATION — NOT AUTHORIZATION TO EXECUTE H02B
```

## Matrix

| ID | Test | Owner | Account/Fixture | Timing | Procedure | Expected Result | Evidence | Stop Condition |
| -- | ---- | ----- | --------------- | ------ | --------- | --------------- | -------- | -------------- |
| ST-01 | Homepage | PENDING | Public URL / marketing homepage | Pre + post | Open homepage; confirm render; spot-check status/health | Homepage renders; no sustained critical 5xx | Screenshot or status note (no secrets) | Sustained critical 5xx / homepage outage |
| ST-02 | Customer authentication | PENDING | Approved test customer only (PENDING id) | Pre + post | Login with approved test customer; confirm session | Session established; protected customer page accessible | Pass/fail note; no credentials | Auth failure storm / unexpected lockout of test customer path |
| ST-03 | Admin authentication | PENDING | Approved admin test account (PENDING id) | Pre + post | Login; open approved protected admin page | Admin session OK; protected page accessible | Pass/fail note; no credentials | Admin lockout / unexpected 403–500 on protected admin path |
| ST-04 | Booking read | PENDING | Approved existing canary booking id (PENDING) | Pre + post | Authorized read of canary booking via approved UI/API | Authorized read succeeds | Pass/fail + booking id only (no PII dumps) | Read 42501 / empty critical booking data for canary |
| ST-05 | Booking write canary | PENDING | **BLOCKED** — reversible write requires explicit dual approval; fixture PENDING | Post only if APPROVED; else blocked | Only if explicitly dual-approved: create dedicated harmless test fixture → verify → cleanup → verify cleanup; otherwise use safe read-only/API alternative listed below. **Prohibit** live customer, payment, payout, booking, invoice, cleaner, or sensitive records as fixtures. Stop/rollback authority required before any write. | Approved canary write succeeds without customer harm; or remains BLOCKED safely | Dual-approval evidence + fixture create/verify/cleanup/post-cleanup notes; no secrets | Unapproved write; use of live sensitive records; write failures; unintended mutations; missing cleanup verification |
| ST-06 | Cleaner authentication or cleaner API | PENDING | Approved cleaner test account or read-only cleaner endpoint (PENDING) | Pre + post | Login or call approved read-only cleaner API | Cleaner auth/API OK | Pass/fail note; no credentials | Cleaner workflow broken / unexpected privilege errors |
| ST-07 | Payment / Paystack | PENDING | Sandbox-compatible or safe config/lookup path (PENDING) | Post | Verify safe payment configuration, transaction lookup, or sandbox-compatible path; **no live charge** | Safe verify path OK; zero live charges initiated | Config/status note; no secrets | Unexpected live charge attempt (immediate stop); payment path broken |
| ST-08 | Storage authorized access | PENDING | Approved test object or controlled test upload (PENDING) | Post | Authorized access to approved object or controlled test upload | Authorized access succeeds | Pass/fail + object path without secrets | Unexpected denial for authorized path; public leak of private object |
| ST-09 | Storage anonymous denial | PENDING | Same private object as ST-08 (or approved private object) without auth | Post | Attempt anonymous/unauthorized access | Unauthorized access remains denied | Pass/fail + status/code | Unexpected anonymous access success |
| ST-10 | Service-role server path | PENDING | Approved server-side endpoint (PENDING) | Post | Invoke approved privileged server path (no client exposure of service role) | Expected privileged path succeeds | Pass/fail + endpoint name only | Service-role hard failure / unexpected 5xx |
| ST-11 | Anonymous table denial | PENDING | Approved anon client against protected tables (PENDING list) | Post | Attempt anon read/write on protected tables via approved probe | Anon remains denied | Pass/fail + table names | Unexpected anon success |
| ST-12 | Privileged RPC denial | PENDING | Unauthorized anon/authenticated caller (PENDING) | Post | Attempt privileged RPCs that Phase 1.11 must deny | Unauthorized EXECUTE denied | Pass/fail + RPC names | Unexpected EXECUTE success |
| ST-13 | Marketing RPC | PENDING | Approved anonymous marketing RPC allowlist (PENDING names) | Post | Call approved marketing RPC(s) anonymously if still intended | Intended marketing RPC remains available | Pass/fail + RPC names | Unexpected denial of intended public marketing RPC |
| ST-14 | Cron / scheduled jobs | PENDING | Dashboard/job health view or approved read-only status path | Post | Inspect cron configuration and recent run health; do **not** manually invoke destructive jobs | Cron config/health normal vs pre-window baseline | Status note / screenshot (no secrets) | Cron failure spike / unexpected disabled critical jobs |
| ST-15 | Invoice / payment authorized read | PENDING | Approved account + canary invoice/payment (PENDING) | Pre + post | Authorized invoice/payment read | Authorized read succeeds | Pass/fail; no PII dumps | Privilege-related read failures |
| ST-16 | Critical API health | PENDING | Critical booking, admin, customer, cleaner, payment endpoints (PENDING list) | Pre + post | Hit approved health/read endpoints | Critical routes healthy | Status codes summary | Sustained 5xx / privilege errors on critical routes |

## ST-05 controls (write canary)

**Status:** **BLOCKED**

Rules:

1. Any reversible write requires **explicit dual approval** before execution.
2. Fixture lifecycle must be documented end-to-end: **creation → verification → cleanup → post-cleanup verification**.
3. **Prohibit** using live customer, payment, payout, booking, invoice, cleaner, or other sensitive production records as fixtures.
4. Require a **dedicated harmless test fixture** (do not invent IDs or owners in this document).
5. Require named **stop/rollback authority** before any write is attempted.
6. If dual approval is absent, mark ST-05 **BLOCKED** and use the safe alternative below.

## ST-05 safe alternative (when write canary blocked)

If ST-05 write canary is not dual-approved, mark ST-05 **BLOCKED** and substitute:

- Authorized booking **read** of the canary (already covered by ST-04), plus
- One approved **non-mutating** booking/API health check from ST-16.

Do not invent a customer-facing write. Do not invent fixture IDs or owners.

## Readiness rollup

| Gate | Status |
|------|--------|
| SMK-01 owners assigned | PENDING |
| SMK-02 accounts/fixtures ready | PENDING |
| SMK-03 non-destructive procedures approved | PENDING (ST-05 **BLOCKED** until dual-approved reversible write + fixture lifecycle + stop/rollback authority, or alternative accepted) |
| SMK-04 evidence capture ready | PENDING |
| SMK-05 stop conditions approved | PENDING (stop text drafted above; human approval PENDING) |

## Companions

- `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md`
- `docs/runbooks/h02b-operator-acknowledgement-2026-07-14.md`
- `docs/audits/h02a-non-production-rehearsal-verification-2026-07-14.md` (H02A REST smoke partial only — not production fixture evidence)
