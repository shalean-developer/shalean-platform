-- Phase 2: authoritative quote fields persisted atomically at booking confirm / payment.
--
-- Team payout trigger must not block duration/quote backfills (same pattern as zoho_invoice_id-only updates).

create or replace function public.bookings_trg_ensure_payout_owner_in_team()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'UPDATE' then
    -- Billing link sync: only zoho_invoice_id (+ updated_at) changed.
    if new.zoho_invoice_id is distinct from old.zoho_invoice_id
       and (to_jsonb(new) - 'zoho_invoice_id' - 'updated_at')
           is not distinct from (to_jsonb(old) - 'zoho_invoice_id' - 'updated_at') then
      return new;
    end if;

    -- Quote / duration persistence: do not re-validate team roster when only authoritative quote fields change.
    if (to_jsonb(new)
          - 'duration_minutes'
          - 'estimated_duration_minutes'
          - 'duration_hours'
          - 'cleaner_workload'
          - 'estimated_finish_at'
          - 'quote_calculation_version'
          - 'pricing_summary'
          - 'total_paid_zar'
          - 'total_price'
          - 'amount_paid_cents'
          - 'service_fee_cents'
          - 'base_amount_cents'
          - 'recurring_discount_cents'
          - 'updated_at')
        is not distinct from (to_jsonb(old)
          - 'duration_minutes'
          - 'estimated_duration_minutes'
          - 'duration_hours'
          - 'cleaner_workload'
          - 'estimated_finish_at'
          - 'quote_calculation_version'
          - 'pricing_summary'
          - 'total_paid_zar'
          - 'total_price'
          - 'amount_paid_cents'
          - 'service_fee_cents'
          - 'base_amount_cents'
          - 'recurring_discount_cents'
          - 'updated_at') then
      return new;
    end if;
  end if;

  if new.is_team_job is true
     and new.team_id is not null
     and new.payout_owner_cleaner_id is not null then
    if exists (
      select 1
        from public.team_members tm
       where tm.team_id = new.team_id
         and tm.cleaner_id = new.payout_owner_cleaner_id
    ) or exists (
      select 1
        from public.booking_cleaners bc
       where bc.booking_id = new.id
         and bc.cleaner_id = new.payout_owner_cleaner_id
         and bc.role = 'lead'
    ) then
      return new;
    end if;
    raise exception 'payout_owner_cleaner_id must be lead on booking_cleaners or member of team_members for team_id %', new.team_id;
  end if;
  return new;
end;
$fn$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS duration_hours numeric(5, 2),
  ADD COLUMN IF NOT EXISTS cleaner_workload numeric(8, 2),
  ADD COLUMN IF NOT EXISTS estimated_finish_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_calculation_version integer;

COMMENT ON COLUMN public.bookings.duration_hours IS
  'One-decimal scheduled job length in hours; mirrors duration_minutes at confirm time.';
COMMENT ON COLUMN public.bookings.cleaner_workload IS
  'Canonical workload weight from unified quote engine at confirm time.';
COMMENT ON COLUMN public.bookings.estimated_finish_at IS
  'Scheduled end instant (Johannesburg wall clock): date + time + duration_minutes.';
COMMENT ON COLUMN public.bookings.quote_calculation_version IS
  'BOOKING_QUOTE_ENGINE_VERSION at confirm; binds price + duration snapshot.';

-- Backfill scheduling column from V2 pricing estimate where legacy path left it null.
UPDATE public.bookings
SET duration_minutes = estimated_duration_minutes
WHERE duration_minutes IS NULL
  AND estimated_duration_minutes IS NOT NULL
  AND estimated_duration_minutes >= 30;

-- Backfill duration_minutes from pricing_summary JSON when both columns are null.
UPDATE public.bookings b
SET duration_minutes = (b.pricing_summary->>'estimated_duration_minutes')::integer
WHERE b.duration_minutes IS NULL
  AND b.pricing_summary IS NOT NULL
  AND (b.pricing_summary->>'estimated_duration_minutes') ~ '^\d+$'
  AND (b.pricing_summary->>'estimated_duration_minutes')::integer >= 30;

-- Mirror hours for backfilled rows.
UPDATE public.bookings
SET duration_hours = round((duration_minutes::numeric / 60.0), 1)
WHERE duration_hours IS NULL
  AND duration_minutes IS NOT NULL
  AND duration_minutes >= 30;
