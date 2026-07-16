# Beaulla Remediation Phase 2 — Summary

| Field | Value |
|-------|-------|
| **Phase** | Beaulla Operational Remediation Phase 2 |
| **Branch** | `beaulla/remediation-phase2-operational-defects` |
| **Date (UTC)** | 2026-07-16 |
| **Scope** | Staging only — no `main` merge, no production deploy |
| **Verdict** | **CONDITIONAL PASS — Non-blocking issues remain** |

---

## Objective

Eliminate remaining operational defects from Beaulla UAT so staging is ready for Release Candidate governance review.

This is **not** a feature phase.

---

## Defect outcomes

| ID | Title | Status | Detail doc |
|----|-------|--------|------------|
| BEA-EMAIL-001 | Booking confirmation email incomplete | **Fixed (code)** | [12-email-remediation.md](./12-email-remediation.md) |
| BEA-BILLING-001 | Recurring billing presentation misleading | **Fixed (code)** | [13-recurring-billing-remediation.md](./13-recurring-billing-remediation.md) |
| BEA-OPS-001 | Recurring generator health | **Fixed (code) + ops verify pending** | [14-cron-remediation.md](./14-cron-remediation.md) |
| BEA-PAYOUT-001 | Cleaner earnings not generated | **Fixed (code) + historic backfill optional** | [15-cleaner-earnings-remediation.md](./15-cleaner-earnings-remediation.md) |

---

## Constraints preserved

- Staging Supabase / Paystack Test / staging CRON_SECRET only
- SMS disabled, WhatsApp disabled
- `safeResendSend` + outbound allowlist retained
- Staging banner / identity checks unchanged
- No production secrets, infra, or promotion

---

## Validation gates

| Gate | Result | Evidence |
|------|--------|----------|
| Targeted unit tests (email/billing/cron/earnings) | PASS (28) | local vitest |
| `test:critical` | PASS (134) | `evidence/beaulla-phase2-test-critical.txt` |
| Full Vitest | PASS (3354 / 532 files) | `evidence/beaulla-phase2-vitest-full.txt` |
| `typecheck` | PASS | `evidence/beaulla-phase2-typecheck.txt` |
| `lint:booking-core` | PASS | `evidence/beaulla-phase2-lint-booking-core.txt` |
| `db:migrations:validate` | PASS (12 migrations incl. email template) | `evidence/beaulla-phase2-migration-validate.txt` |
| `next build --webpack` | PASS | `evidence/beaulla-phase2-next-build.txt` |

---

## Staging operator follow-ups (non-blocking for code)

1. Deploy this branch to **staging Preview** (do not promote production).
2. Apply migration `20260716170000_beaulla_booking_confirmed_email_customer_refs.sql` on **staging** Supabase so the DB `booking_confirmed` template matches code.
3. Run `node scripts/env/beaulla-recurring-generator-staging-probe.mjs` and, if needed, repair staging pg_cron via `print-repair-generate-recurring-pg-cron.sql.mjs` with **staging** URL + staging `CRON_SECRET`.
4. Optional: backfill historic completed bookings with null `cleaner_id` if office Visits remain 0 for old rows.
5. Re-send one allowlisted booking confirmation on staging and confirm SHL-BK / PAY refs + full summary.

---

## Stop conditions (honoured)

- Not merged to `main`
- Not promoted to production
- Production secrets untouched
- SMS / WhatsApp not enabled
- RC governance not started

---

## Remaining risks

| Risk | Severity | Notes |
|------|----------|-------|
| Staging pg_cron / `cron_http_targets` misaligned until operator repair | Medium | Code no longer false-flags plan skips as “down”; empty `cron_runs` still needs ops fix |
| Historic completed bookings without cleaner allocation | Low | New completions stamp owner; old rows may need backfill |
| DB email template not applied on staging until migration | Medium | Code + legacy HTML fixed; DB path needs migration apply |
| Manual email/screenshot UAT after Preview deploy | Low | Screenshots deferred until Preview deploy |

---

## Verdict rationale

**CONDITIONAL PASS** — all four defects have durable code remediations on the staging branch, with unit + critical gates green. Live staging confirmation (Preview deploy, template migration apply, recurring generator probe, one allowlisted confirmation email) remains operator follow-up and is treated as **non-blocking** for code readiness pending that staging apply.
