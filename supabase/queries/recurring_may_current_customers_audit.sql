-- ============================================================================
-- Audit: active recurring plans (billing per_booking/monthly; missing user_profiles → per_booking)
-- Window: 1 May (same calendar year as Johannesburg today) → Johannesburg today
-- ============================================================================
-- Run in Supabase → SQL Editor (service role / dashboard runs as postgres).
--
-- Why there is no safe "seed bookings" INSERT here:
--   Recurring visits require `booking_snapshot` JSON built from
--   `recurring_bookings.booking_snapshot_template` (locked date, Paystack ref, etc.).
--   Use Admin → Recurring → **Backfill to today** per plan, **Backfill all (May→today)** for all eligible plans, or:
--     POST /api/admin/recurring/{recurring_id}/backfill-occurrences
--     POST /api/admin/recurring-batch-backfill-may-to-today   (?limit=50 optional)
--   with an admin Bearer token (same logic as the app; skips duplicates).
-- ============================================================================

with params as (
  select
    (timezone('Africa/Johannesburg', now()))::date as jhb_today,
    (to_char((timezone('Africa/Johannesburg', now()))::date, 'YYYY') || '-05-01')::date as may_first
),
active_recurring_profiled as (
  select
    rb.*,
    coalesce(up.billing_type::text, 'per_booking') as billing_resolved
  from public.recurring_bookings rb
  left join public.user_profiles up on up.id = rb.customer_id
  where rb.status = 'active'
    and coalesce(up.billing_type::text, 'per_booking') in ('per_booking', 'monthly')
),
scoped as (
  select
    arp.*,
    p.jhb_today,
    p.may_first,
    greatest(arp.start_date::date, p.may_first) as window_from,
    least(coalesce(arp.end_date::date, p.jhb_today), p.jhb_today) as window_to
  from active_recurring_profiled arp
  cross join params p
),
booking_counts as (
  select
    s.id as recurring_id,
    count(b.id)::bigint as recurring_bookings_in_window
  from scoped s
  left join public.bookings b
    on b.recurring_id = s.id
   and b.date is not null
   and b.date::date >= s.window_from
   and b.date::date <= s.window_to
   and coalesce(b.is_recurring_generated, false) = true
  where s.window_from <= s.window_to
  group by s.id
)
select
  s.id as recurring_id,
  au.email as customer_email,
  s.billing_resolved as billing_type,
  s.frequency,
  s.next_run_date,
  s.start_date,
  s.end_date,
  s.jhb_today,
  s.may_first,
  s.window_from,
  s.window_to,
  coalesce(bc.recurring_bookings_in_window, 0) as recurring_generated_rows_in_window,
  case
    when s.window_from > s.window_to then 'no_window_may_to_today'
    else 'eligible_for_backfill'
  end as audit_note
from scoped s
left join auth.users au on au.id = s.customer_id
left join booking_counts bc on bc.recurring_id = s.id
order by coalesce(au.email, s.customer_id::text), s.id;


-- ============================================================================
-- Export only: recurring_id values with a non-empty May→today window (rerun
-- after audit). Use with Admin backfill or your own HTTP batch — not raw INSERT.
-- ============================================================================

with params as (
  select
    (timezone('Africa/Johannesburg', now()))::date as jhb_today,
    (to_char((timezone('Africa/Johannesburg', now()))::date, 'YYYY') || '-05-01')::date as may_first
),
active_recurring_profiled as (
  select rb.id, rb.start_date, rb.end_date
  from public.recurring_bookings rb
  left join public.user_profiles up on up.id = rb.customer_id
  where rb.status = 'active'
    and coalesce(up.billing_type::text, 'per_booking') in ('per_booking', 'monthly')
),
scoped as (
  select
    arp.id,
    greatest(arp.start_date::date, p.may_first) as window_from,
    least(coalesce(arp.end_date::date, p.jhb_today), p.jhb_today) as window_to
  from active_recurring_profiled arp
  cross join params p
)
select id as recurring_id
from scoped
where window_from <= window_to
order by id;


-- ============================================================================
-- Exact path (copy whole line; common mistake is dropping "batch-"):
--   /api/admin/recurring-batch-backfill-may-to-today
-- GET returns JSON if this route is deployed; POST runs backfill (admin JWT).
--
-- After audit: backfill ONLY a subset (replace TOKEN and HOST). Omit JSON
-- body to run all active eligible plans.
--
-- Windows PowerShell: `curl` is Invoke-WebRequest — use curl.exe OR:
--
--   $body = '{"recurring_ids":["1c71d216-22c1-4a8e-bec5-65d664f34f2e","44198d90-1ff4-4834-b839-1e0c71271001","51288062-bbad-4f4a-bec5-b2aad8917f60","532b3f6b-128c-4e02-87db-ef2e093cb490","6e41bb4c-2540-4963-955c-0cb295ebcf3b","6ff25013-29c0-4f72-9e75-9f22e21ba655","81838e7e-f1e7-455c-a758-a30e7a01c5bd","a905f2dc-e42b-4542-9173-52c45c31af2f"]}'
--   Invoke-RestMethod -Uri "https://HOST/api/admin/recurring-batch-backfill-may-to-today" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer TOKEN" } -Body $body
--
-- Windows (same flags as macOS/Linux) — real curl binary:
--
--   curl.exe -sS -X POST "https://HOST/api/admin/recurring-batch-backfill-may-to-today" -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d "{\"recurring_ids\":[\"1c71d216-22c1-4a8e-bec5-65d664f34f2e\",\"44198d90-1ff4-4834-b839-1e0c71271001\",\"51288062-bbad-4f4a-bec5-b2aad8917f60\",\"532b3f6b-128c-4e02-87db-ef2e093cb490\",\"6e41bb4c-2540-4963-955c-0cb295ebcf3b\",\"6ff25013-29c0-4f72-9e75-9f22e21ba655\",\"81838e7e-f1e7-455c-a758-a30e7a01c5bd\",\"a905f2dc-e42b-4542-9173-52c45c31af2f\"]}"
--
-- bash / macOS / Linux:
--
--   curl -sS -X POST "https://HOST/api/admin/recurring-batch-backfill-may-to-today" \
--     -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
--     -d "{\"recurring_ids\":[\"1c71d216-22c1-4a8e-bec5-65d664f34f2e\",\"44198d90-1ff4-4834-b839-1e0c71271001\",\"51288062-bbad-4f4a-bec5-b2aad8917f60\",\"532b3f6b-128c-4e02-87db-ef2e093cb490\",\"6e41bb4c-2540-4963-955c-0cb295ebcf3b\",\"6ff25013-29c0-4f72-9e75-9f22e21ba655\",\"81838e7e-f1e7-455c-a758-a30e7a01c5bd\",\"a905f2dc-e42b-4542-9173-52c45c31af2f\"]}"
-- ============================================================================
