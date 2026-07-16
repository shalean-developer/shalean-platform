# BEA-OPS-001 — Recurring generator cron remediation

| Field | Value |
|-------|-------|
| **Defect** | BEA-OPS-001 |
| **Date (UTC)** | 2026-07-16 |
| **Environment** | Staging |
| **Status** | Code fixed; live staging probe pending operator |

---

## Root cause

1. **Architecture:** `generate-recurring-bookings` is driven by Supabase **pg_cron → pg_net → Next.js**, not Vercel Cron (`vercel.json` does not schedule it).
2. **False “may be down”:** Plan skips (`skipped_plans`) were treated as hard cron failures → `cron_runs.status=error` → `last_success_at` went stale → after 30 minutes the office UI showed “Recurring generator may be down” even while the job was invoking.
3. **Ops gap:** Staging `cron_http_targets` / `CRON_SECRET` / Preview URL can still be misaligned (no `cron_runs` rows) — separate from the code false-positive.

---

## Before / after

| Behaviour | Before | After |
|-----------|--------|-------|
| Hard failure | `failed > 0` **or** `skipped_plans > 0` | `failed > 0` only |
| Plan skips | Mark cron `error` → “may be down” | Cron `success`; amber operational warning |
| Insert failures | Error | Error (unchanged) |
| Probe | Ad-hoc | `scripts/env/beaulla-recurring-generator-staging-probe.mjs` |

---

## Changes made

| File | Change |
|------|--------|
| `lib/recurring/recurringGeneratorRunSummary.ts` | Hard failure = insert failures only; plan-skip warning severity |
| `lib/recurring/__tests__/recurringGeneratorRunSummary.test.ts` | Coverage |
| `app/api/cron/generate-recurring-bookings/route.ts` | Plan-skip ops alert → warn |
| `scripts/env/beaulla-recurring-generator-staging-probe.mjs` | Staging health probe |

---

## Operator staging checklist

1. Deploy Preview with this branch.
2. `node scripts/env/beaulla-recurring-generator-staging-probe.mjs`
3. If no/stale `generate-recurring-bookings` success rows: run repair SQL from `apps/web/scripts/print-repair-generate-recurring-pg-cron.sql.mjs` against **staging** with staging Preview URL + staging `CRON_SECRET`.
4. Confirm office Recurring page warning clears after a successful run (~10 min cadence).

---

## Remaining risks

- Empty `cron_runs` still correctly shows red until pg_cron/targets are repaired on staging.
- Production untouched by design.
