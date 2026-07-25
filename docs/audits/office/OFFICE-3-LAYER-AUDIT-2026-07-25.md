# Office Dashboard Three-Layer Audit

## Executive summary

NO-GO — OFFICE DASHBOARD NOT YET VERIFIED 100% ACCURATE

Application↔Database agreement on available numeric/rule metrics: **33 agree**, **0 disagree**. UI layer available: **false**.

| Field | Value |
| --- | --- |
| Generated | 2026-07-25T13:27:57.969Z |
| Audit date (JHB) | 2026-07-25 |
| Target | production |
| Base URL | https://shalean.co.za |
| Read-only | true |
| Decision | NO-GO — OFFICE DASHBOARD NOT YET VERIFIED 100% ACCURATE |

## Counts

| Status | Count |
| --- | ---:|
| PASS | 0 |
| FAIL | 0 |
| BLOCKED | 33 |
| NOT IMPLEMENTED | 0 |
| NOT AUTHORITATIVE | 1 |
| SKIPPED WITH JUSTIFICATION | 0 |

## Three-layer results

| Metric | UI | App | DB | Status | Finding |
| --- | --- | --- | --- | --- | --- |
| ops.total_bookings_today | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| ops.completed | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| ops.in_progress | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| ops.upcoming | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| ops.unassigned | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| ops.cancelled_excluded | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| ops.payments_received_today | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| ops.paid_by_payment_time | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| ops.visit_paid_value | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| action.unassigned | null | 3 | 3 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| action.starting_within_2h | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| action.sla_breaches | null | 6 | 6 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| action.unassignable | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| schedule.total | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| schedule.completed | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| schedule.in_progress | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| schedule.upcoming | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| schedule.unassigned | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| schedule.row_status_rules | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| schedule.row_assignment_rules | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| capacity.active_workforce | null | 6 | 6 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| capacity.available_now | null | 4 | 4 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| capacity.available | null | 4 | 4 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| capacity.booked_or_in_job | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| capacity.off_today | null | 2 | 2 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| capacity.offline_or_paused | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| revenue.receivables_exposure | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| revenue.payments_received_today | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| revenue.pending_bookings | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| revenue.overdue_invoices | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| summary.bookings_30d | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| summary.avg_booking_value | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| summary.pending_payments | null | 0 | 0 | BLOCKED | Missing layer evidence: ui=false app=true db=true |
| summary.system_health | null | null | null | NOT AUTHORITATIVE | Missing layer evidence: ui=false app=false db=false |

## Schema notes
- bookings.date is the schedule/start date column (text YYYY-MM-DD); bookings.booking_date does not exist
- public.payments does not exist; home revenue uses booking payment columns
- payment_transactions exists as ledger but is not the home dashboard revenue SoT
- Needs Action uses cleaner_id/team_id only (not booking_cleaners); schedule assignment includes roster
- public.payments unavailable: Could not find the table 'public.payments' in the schema cache

## Blockers
- ops.total_bookings_today: BLOCKED — Missing layer evidence: ui=false app=true db=true
- ops.completed: BLOCKED — Missing layer evidence: ui=false app=true db=true
- ops.in_progress: BLOCKED — Missing layer evidence: ui=false app=true db=true
- ops.upcoming: BLOCKED — Missing layer evidence: ui=false app=true db=true
- ops.unassigned: BLOCKED — Missing layer evidence: ui=false app=true db=true
- ops.cancelled_excluded: BLOCKED — Missing layer evidence: ui=false app=true db=true
- ops.payments_received_today: BLOCKED — Missing layer evidence: ui=false app=true db=true
- ops.paid_by_payment_time: BLOCKED — Missing layer evidence: ui=false app=true db=true
- ops.visit_paid_value: BLOCKED — Missing layer evidence: ui=false app=true db=true
- action.unassigned: BLOCKED — Missing layer evidence: ui=false app=true db=true
- action.starting_within_2h: BLOCKED — Missing layer evidence: ui=false app=true db=true
- action.sla_breaches: BLOCKED — Missing layer evidence: ui=false app=true db=true
- action.unassignable: BLOCKED — Missing layer evidence: ui=false app=true db=true
- schedule.total: BLOCKED — Missing layer evidence: ui=false app=true db=true
- schedule.completed: BLOCKED — Missing layer evidence: ui=false app=true db=true
- schedule.in_progress: BLOCKED — Missing layer evidence: ui=false app=true db=true
- schedule.upcoming: BLOCKED — Missing layer evidence: ui=false app=true db=true
- schedule.unassigned: BLOCKED — Missing layer evidence: ui=false app=true db=true
- schedule.row_status_rules: BLOCKED — Missing layer evidence: ui=false app=true db=true
- schedule.row_assignment_rules: BLOCKED — Missing layer evidence: ui=false app=true db=true
- capacity.active_workforce: BLOCKED — Missing layer evidence: ui=false app=true db=true
- capacity.available_now: BLOCKED — Missing layer evidence: ui=false app=true db=true
- capacity.available: BLOCKED — Missing layer evidence: ui=false app=true db=true
- capacity.booked_or_in_job: BLOCKED — Missing layer evidence: ui=false app=true db=true
- capacity.off_today: BLOCKED — Missing layer evidence: ui=false app=true db=true
- capacity.offline_or_paused: BLOCKED — Missing layer evidence: ui=false app=true db=true
- revenue.receivables_exposure: BLOCKED — Missing layer evidence: ui=false app=true db=true
- revenue.payments_received_today: BLOCKED — Missing layer evidence: ui=false app=true db=true
- revenue.pending_bookings: BLOCKED — Missing layer evidence: ui=false app=true db=true
- revenue.overdue_invoices: BLOCKED — Missing layer evidence: ui=false app=true db=true
- summary.bookings_30d: BLOCKED — Missing layer evidence: ui=false app=true db=true
- summary.avg_booking_value: BLOCKED — Missing layer evidence: ui=false app=true db=true
- summary.pending_payments: BLOCKED — Missing layer evidence: ui=false app=true db=true
- summary.system_health: NOT AUTHORITATIVE — Missing layer evidence: ui=false app=false db=false

## Privacy
- Redaction applied: true
- Prohibited fields stripped: customer names, customer emails, phone numbers, addresses, booking IDs, cleaner IDs, access tokens, refresh tokens, Supabase keys, project references, service-role credentials, payment references

## Additional findings (app↔DB layer; UI still blocked)

| Finding | Classification | Notes |
| --- | --- | --- |
| UI layer unavailable | unavailable evidence | No `OFFICE_AUDIT_ADMIN_EMAIL/PASSWORD` or storage state in this environment |
| System health | NOT AUTHORITATIVE | Depends on `collectOfficeOpsHealthSignals` + production health scanner; not a single SQL metric |
| SLA breaches = 6 (live) | data integrity / ops signal | Independent DB matches app; UI not verified |
| Unassigned Needs Action = 3 (live) | ops signal | Fleet-wide; today visit-day unassigned = 0 |
| Overdue invoices ZAR = 0 while an invoice `due_date` is before today | business-rule ambiguity | Dashboard only sums `status=overdue OR is_overdue=true`; past-due `sent` drafts are excluded by design |
| Bookings with `status='paid'` | business-rule ambiguity | Not mapped to completed/in_progress/cancelled; falls into upcoming/unassigned by assignment |
| Page `johannesburgTodayYmd` uses `en-ZA` parts; ops uses `en-CA` | timezone defect (low) | Both target Africa/Johannesburg; report inconsistency, do not silently unify in this audit |
| Row status/assignment UI pairing | unavailable evidence | Requires Playwright + non-PII DOM↔API pairing; left BLOCKED rather than false PASS |
| App↔DB agreement | 33/33 | Independent calculations matched application helpers on this snapshot |

## Proposed fixes (not executed)

1. **Provide audit admin credentials** (`OFFICE_AUDIT_ADMIN_EMAIL/PASSWORD` or storage state) and re-run against `https://shalean.co.za/office` with `OFFICE_AUDIT_READ_ONLY=true`.
2. **Expose system health as an authoritative queryable snapshot** (or documented RPC) so the DB layer can independently reproduce website/bookingEngine/paymentGateway/cronErrors.
3. **Clarify overdue invoice SoT**: either auto-set `is_overdue` from `due_date`, or label the widget “Overdue-flagged invoices” to avoid past-due `sent` ambiguity.
4. **Document or normalize `status='paid'`** in schedule bucketing (treat as upcoming-with-assignment vs completed).
5. **Unify Johannesburg “today” helpers** onto one shared function (`todayYmdJohannesburg` / `en-CA`) — report-only in this audit.
6. **Add non-PII schedule row keys in the DOM** (e.g. hashed test ids) so row status/assignment can be three-layer verified without leaking booking IDs.

### Per-metric blockers
- **ops.total_bookings_today** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **ops.completed** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **ops.in_progress** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **ops.upcoming** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **ops.unassigned** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **ops.cancelled_excluded** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **ops.payments_received_today** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **ops.paid_by_payment_time** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **ops.visit_paid_value** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **action.unassigned** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **action.starting_within_2h** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **action.sla_breaches** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **action.unassignable** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **schedule.total** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **schedule.completed** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **schedule.in_progress** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **schedule.upcoming** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **schedule.unassigned** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **schedule.row_status_rules** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **schedule.row_assignment_rules** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **capacity.active_workforce** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **capacity.available_now** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **capacity.available** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **capacity.booked_or_in_job** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **capacity.off_today** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **capacity.offline_or_paused** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **revenue.receivables_exposure** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **revenue.payments_received_today** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **revenue.pending_bookings** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **revenue.overdue_invoices** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **summary.bookings_30d** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **summary.avg_booking_value** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **summary.pending_payments** (BLOCKED): Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured.
- **summary.system_health** (NOT AUTHORITATIVE): Missing layer evidence: ui=false app=false db=false