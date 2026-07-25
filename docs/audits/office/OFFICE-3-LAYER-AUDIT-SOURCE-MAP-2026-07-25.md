# Office `/office` metric source map & schema (discovered)

Audit date: 2026-07-25  
Branch: `cursor/office-3-layer-audit-8781`  
Primary UI: `apps/web/app/(ui-redesign)/office/page.tsx`

## Real endpoints / helpers used

| Layer | Path | Role |
| --- | --- | --- |
| UI | `/office` | Client dashboard |
| API | `GET /api/admin/schedule/day?date=YYYY-MM-DD` | Day schedule, summary, visit finance, cleaners |
| API | `GET /api/admin/ops-snapshot` | Needs Action fleet queues |
| API | `GET /api/admin/dashboard-stats` | Payment-day revenue, pending, overdue, system status |
| Hook | `hooks/useAdminData.ts` | Bearer fetch, `cache: "no-store"` |
| Helper | `computeOfficeTodayScheduleStats` | Schedule buckets |
| Helper | `computeOfficeVisitDayFinance` | Visit-day paid value |
| Helper | `computeOfficeScheduleCleanerStats` | Capacity |
| Helper | `computeOpsSnapshotFromRows` | Needs Action |
| Helper | `fetchAdminDashboardRevenueSummary` / `computeAdminDashboardRevenueSummary` | Revenue KPIs |
| Helper | `buildDashboardSystemStatusFromOfficeOps` | System health labels |

**Confirmed absent:** `/api/office/dashboard`, `/api/workforce`, `/api/analytics`, retired `GET /api/bookings`.

All three admin routes use `export const dynamic = "force-dynamic"`. No RPC/materialized view powers the home widgets.

## Real schema discovered

| Object | Fact |
| --- | --- |
| `public.bookings` | Schedule column is **`date` (text)**; **`booking_date` does not exist** |
| `public.payments` | **Does not exist** (PostgREST PGRST205) |
| `public.payment_transactions` | Exists (ledger); **not** home revenue SoT |
| `public.monthly_invoices` | Overdue via `status='overdue' OR is_overdue=true`; amount = positive `balance_cents` |
| `public.cleaners` | Active filter `is_active is null OR true`; capacity uses `is_available`, `status`, `availability_weekdays` |
| `public.booking_cleaners` | Roster join for schedule assignment / capacity |
| Payment SoT on bookings | `payment_status`, `payment_completed_at`, `amount_paid_cents`, `total_paid_zar`, refund fields, monthly child flags |
| Ops assignment | `cleaner_id` **or** `team_id` only (ignores roster / `selected_cleaner_id`) |
| Schedule assignment | `cleaner_id` **or** `team_id` **or** `booking_cleaners` rows; `selected_cleaner_id` alone = Preferred / Unassigned |
| Timezone | Africa/Johannesburg (+02:00); payment day = `payment_completed_at` in JHB civil day; visit day = `bookings.date` |

## Metric → source map (abbreviated)

| Section | Metric | App source | DB SoT |
| --- | --- | --- | --- |
| Today's operations | total / completed / in progress / upcoming / unassigned / cancelled excluded | `schedule/day.summary` | `bookings` where `date=:ymd` + status/assignment rules |
| Today's operations | Payments received today / paid by payment time | `dashboard-stats.revenueTodayZar` / `paidBookingsToday` | eligible bookings by `payment_completed_at` today |
| Today's operations | Visit paid value | `schedule/day.finance.paidValueZar` | visit-date eligible paid (excl. monthly children) |
| Needs action | unassigned / starting soon / SLA / unassignable | `ops-snapshot.*` | open bookings exclusive queues |
| Today's schedule | same buckets + row status/assignment | `schedule/day` + presentation helpers | same + roster |
| Cleaner capacity | active / available / busy / off / offline | client `computeOfficeScheduleCleanerStats` | `cleaners` + day bookings |
| Revenue & receivables | exposure / pending / overdue | client sum + `paymentsSnapshot` | bookings pending_payment + monthly_invoices overdue |
| Summary cards | 30d bookings / avg value / pending / system health | `dashboard-stats` | revenue window / pending / multi-signal health |

## Important non-equivalence

- **Day schedule unassigned ≠ Needs Action unassigned** (different fleet scope and paid/recurring gates).
- **Visit-day completed ≠ Payments received today** (payment_completed_at vs bookings.date).
- **Receivables exposure ≠ bank cash** (sum of payment-day revenue + pending quotes + overdue invoice balances).

## Observed live DB snapshot (redacted, 2026-07-25 JHB)

Service-role read against configured Supabase project (not Playwright UI):

| Metric | App | Independent DB |
| --- | ---:| ---:|
| Visit-day bookings today | 0 | 0 |
| Needs Action unassigned | 3 | 3 |
| SLA breaches | 6 | 6 |
| Active workforce | 6 | 6 |
| Available now | 4 | 4 |
| Off today | 2 | 2 |
| Payments received today | 0 | 0 |
| Overdue invoices ZAR | 0 | 0 |

App↔DB: **33/33 agree** on available metrics. UI: **blocked** (no audit admin credentials). System health: **not authoritative** without dashboard-stats HTTP + production health scanner.

## Pre-merge checklist (audit infrastructure only)

| Check | Result |
| --- | --- |
| CI: `lint:booking-core` | PASS |
| CI: `typecheck` | PASS |
| CI: `test:critical` (134) | PASS |
| CI: `audit:production` (0 high) | PASS |
| Unit: `test:office-audit` | PASS |
| Audit reports contain no personal/credential data | PASS (scanned; redaction applied) |
| Runner cannot perform production writes | PASS (read-only fetch on Supabase + Playwright abort of non-auth writes; `OFFICE_AUDIT_READ_ONLY=true` required for production) |
| Incomplete evidence → nonzero exit | PASS (`BLOCKED` / `NOT AUTHORITATIVE` / `FAIL` → exit `1`) |
| `data-testid` privacy / production safety | PASS (aggregate metric labels only; no booking/customer/cleaner IDs; schedule row pairing left BLOCKED rather than leaking IDs) |
| Claims `/office` 100% accurate | **NO** — decision remains **NO-GO** |

### After merge + deploy (operator steps)

1. Run `npm run audit:office` against production with a **restricted audit-admin** account.
2. Capture all 33 UI metrics (do not skip BLOCKED).
3. Compare UI → application → independent database; return PASS/FAIL per metric.
4. Keep `system_health` as **NOT AUTHORITATIVE** until an independent health source exists.
5. Do not change production data or business logic.
6. Only then reconsider GO/NO-GO for 100% Office dashboard accuracy.
