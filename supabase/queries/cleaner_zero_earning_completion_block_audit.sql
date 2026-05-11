-- ============================================================================
-- Audit: cleaner-cannot-complete-because-job-earning-is-R0,00
-- ----------------------------------------------------------------------------
-- Use this to investigate any booking where the cleaner job-detail page shows
-- "Job earning unavailable — contact support" and the Complete button is
-- disabled (or the API returns HTTP 422 `job_earning_unavailable`).
--
-- Replace `:booking_id` with the booking UUID, OR use the block at the bottom
-- to look up the booking by date + customer + suburb.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Booking — payout / earning / status / payment fields
-- ----------------------------------------------------------------------------
select
  b.id,
  b.status,
  b.dispatch_status,
  b.payment_status,
  b.is_recurring_generated,
  b.billing_type,
  b.is_monthly_billing_booking,
  b.monthly_invoice_id,
  b.service,
  b.service_slug,
  b.rooms,
  b.bathrooms,
  b.total_price,
  b.total_paid_zar,
  b.total_paid_cents,
  b.amount_paid_cents,
  b.base_amount_cents,
  b.service_fee_cents,
  b.cleaner_id,
  b.payout_owner_cleaner_id,
  b.team_id,
  b.is_team_job,
  b.cleaner_response_status,
  b.assigned_at,
  b.accepted_at,
  b.en_route_at,
  b.started_at,
  b.completed_at,
  b.payment_completed_at,
  -- earning / payout columns (the source of truth for "Job earning")
  b.display_earnings_cents,
  b.cleaner_earnings_total_cents,
  b.payout_frozen_cents,
  b.cleaner_payout_cents,
  b.cleaner_bonus_cents,
  b.payout_earnings_cents,
  b.internal_earnings_cents,
  b.payout_id,
  b.payout_status,
  b.payout_paid_at,
  b.earnings_model_version,
  b.earnings_percentage_applied,
  b.earnings_cap_cents_applied,
  b.payment_needs_follow_up,
  b.refunded_at,
  b.refund_status
from public.bookings b
where b.id = :'booking_id';

-- ----------------------------------------------------------------------------
-- B. Dispatch offers for this booking
-- ----------------------------------------------------------------------------
select
  d.id,
  d.booking_id,
  d.cleaner_id,
  d.status,
  d.created_at,
  d.expires_at,
  d.responded_at,
  d.dispatch_attempt,
  d.dispatch_round,
  d.smart_assigned,
  d.smart_assignment_score
from public.dispatch_offers d
where d.booking_id = :'booking_id'
order by d.created_at asc;

-- ----------------------------------------------------------------------------
-- C. cleaner_payouts row for this booking (if any)
-- ----------------------------------------------------------------------------
select
  cp.id,
  cp.cleaner_id,
  cp.week_start,
  cp.week_end,
  cp.status,
  cp.frozen_at,
  cp.gross_cents,
  cp.payout_cents
from public.cleaner_payouts cp
join public.bookings b on b.payout_id = cp.id
where b.id = :'booking_id';

-- ----------------------------------------------------------------------------
-- D. cleaner_earnings ledger rows for this booking
-- ----------------------------------------------------------------------------
select
  e.id,
  e.booking_id,
  e.cleaner_id,
  e.line_id,
  e.line_item_type,
  e.amount_cents,
  e.status,
  e.created_at,
  e.computed_at
from public.cleaner_earnings e
where e.booking_id = :'booking_id'
order by e.created_at asc;

-- ----------------------------------------------------------------------------
-- E. Booking line items (look for the `(backfill)` `pricing_source = backfill_v1`
--    base line at 0 cents — this is the smoking gun for unpaid recurring rows)
-- ----------------------------------------------------------------------------
select
  li.id,
  li.item_type,
  li.slug,
  li.name,
  li.quantity,
  li.unit_price_cents,
  li.total_price_cents,
  li.pricing_source,
  li.metadata
from public.booking_line_items li
where li.booking_id = :'booking_id'
order by li.item_type asc, li.id asc;

-- ----------------------------------------------------------------------------
-- F. Recurring source (if applicable) — confirms whether the schedule has a
--    real `recurring_bookings.price` we could re-derive earnings from.
-- ----------------------------------------------------------------------------
select
  r.id as recurring_id,
  r.customer_id,
  r.price as recurring_price_zar,
  r.frequency,
  r.start_date,
  r.end_date,
  r.status as recurring_status,
  r.last_generated_at,
  r.next_run_date
from public.recurring_bookings r
join public.bookings b
  on b.recurring_id = r.id
where b.id = :'booking_id';

-- ----------------------------------------------------------------------------
-- G. Lookup helper: find the booking by (date, time, customer hint, suburb hint)
--    Run this first if you do not have the booking UUID.
--
--    Example: Estery / 2026-05-12 08:30 / Farai Chitekedza / Claremont
-- ----------------------------------------------------------------------------
-- select b.id, b.status, b.service, b.date, b.time, b.location, b.cleaner_id,
--        b.display_earnings_cents, b.cleaner_earnings_total_cents
-- from public.bookings b
-- where b.date = '2026-05-12'
--   and b.time::text like '08:30%'
--   and (b.customer_name ilike '%farai%' or b.location ilike '%sloop%')
-- order by b.created_at desc
-- limit 5;

-- ----------------------------------------------------------------------------
-- H. Bulk audit: find ALL assigned / in_progress bookings currently blocked
--    by the new R0 completion gate (`job_earning_unavailable`).
--    These are the bookings the cleaner will see "Cannot complete job…" on.
--
--    Apply repair via:
--      cd apps/web && npm run repair:zero-earning-assigned -- --dry-run
--    Or per-booking via:
--      POST /api/admin/bookings/{id}/reset-earnings?force=true
-- ----------------------------------------------------------------------------
select
  b.id,
  b.status,
  b.date,
  b.time,
  b.service,
  b.cleaner_id,
  b.display_earnings_cents,
  b.cleaner_earnings_total_cents,
  b.is_recurring_generated,
  b.billing_type,
  b.monthly_invoice_id,
  b.is_team_job
from public.bookings b
where b.status in ('assigned', 'in_progress')
  and (b.cleaner_id is not null or b.payout_owner_cleaner_id is not null)
  and (b.display_earnings_cents is null or b.display_earnings_cents <= 0)
order by b.date asc, b.time asc
limit 100;
