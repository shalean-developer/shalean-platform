-- Forward prevention only. No data repair or May–September mutation.
begin;
CREATE OR REPLACE FUNCTION public.apply_booking_earnings_policy_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_policy text := 'current_v1';
  v_legacy_cents integer;
  v_service text;
  v_financial_cap_cents bigint;
  v_participants integer := 1;
  v_marker jsonb;
  v_marker_cleaner text;
  v_header_at_removal text;
  v_primary_cleaner text;
begin
  v_service := lower(coalesce(new.service_slug, new.service, ''));

  if new.recurring_id is not null then
    select rb.earnings_policy, rb.legacy_earnings_cents
      into v_policy, v_legacy_cents
    from public.recurring_bookings rb
    where rb.id = new.recurring_id;
  end if;

  if coalesce(v_policy, 'current_v1') = 'current_v1' and new.customer_id is not null then
    select cep.earnings_policy, cep.legacy_earnings_cents
      into v_policy, v_legacy_cents
    from public.customer_earnings_policies cep
    where cep.customer_id = new.customer_id
      and v_service = any(cep.applies_to_services);
  end if;

  new.earnings_policy := coalesce(v_policy, 'current_v1');

  v_marker := new.metadata -> 'payout_attribution_removal_v1';
  if coalesce((v_marker ->> 'active')::boolean, false) then
    v_marker_cleaner := nullif(btrim(v_marker ->> 'cleaner_id'), '');
    v_header_at_removal := coalesce(
      nullif(btrim(v_marker ->> 'header_cleaner_id_at_removal'), ''),
      v_marker_cleaner
    );
    v_primary_cleaner := coalesce(
      nullif(btrim(new.cleaner_id::text), ''),
      nullif(btrim(new.payout_owner_cleaner_id::text), '')
    );

    -- The removal marker suppresses the legacy lock only while the booking is
    -- still unassigned or still points at the same historical header cleaner.
    -- A replacement cleaner makes the marker non-authoritative immediately,
    -- so the legacy fixed amount is restored during reassignment recompute.
    if v_header_at_removal is not null
       and (v_primary_cleaner is null or v_primary_cleaner = v_header_at_removal) then
      return new;
    end if;
  end if;

  if new.earnings_policy = 'legacy_july'
     and v_service in ('standard', 'regular-cleaning', 'airbnb')
     and coalesce(v_legacy_cents, 0) > 0 then
    new.display_earnings_cents := v_legacy_cents;
    new.internal_earnings_cents := v_legacy_cents;
    -- October onward only: fixed rate is per roster participant, not the job pool.
    if new.date >= '2026-10-01' and not coalesce(new.is_team_job, false) then
      select greatest(count(distinct bc.cleaner_id), 1)::integer into v_participants
      from public.booking_cleaners bc where bc.booking_id = new.id;
      new.internal_earnings_cents := v_legacy_cents * v_participants;
      -- Signed, participant-specific adjustments remain part of the obligation.
      with participants as (
        select distinct bc.cleaner_id from public.booking_cleaners bc where bc.booking_id=new.id
        union all
        select coalesce(new.cleaner_id,new.payout_owner_cleaner_id)
        where not exists(select 1 from public.booking_cleaners bc where bc.booking_id=new.id)
      )
      select coalesce(sum(greatest(v_legacy_cents + coalesce((
        select sum(a.amount_cents) from public.cleaner_earnings_adjustments a
        where a.booking_id=new.id and a.cleaner_id=p.cleaner_id
      ),0),0)),v_legacy_cents)::integer into new.internal_earnings_cents from participants p;
    end if;

    v_financial_cap_cents := case
      when lower(trim(coalesce(new.billing_type, ''))) = any (array['recurring_invoice', 'monthly_contract', 'pay_later'])
        or coalesce(new.is_monthly_billing_booking, false)
        or lower(trim(coalesce(new.payment_status, ''))) = 'pending_monthly'
        or new.monthly_invoice_id is not null
      then coalesce(
        new.total_paid_cents::bigint,
        case when new.total_paid_zar is not null and new.total_paid_zar > 0
          then round(new.total_paid_zar * 100)::bigint else null end,
        nullif(new.amount_paid_cents, 0)::bigint,
        0::bigint
      )
      when lower(trim(coalesce(new.payment_status, ''))) = 'success' then greatest(
        coalesce(new.total_paid_cents::bigint, new.amount_paid_cents::bigint,
          case when new.total_paid_zar is not null and new.total_paid_zar > 0
            then round(new.total_paid_zar * 100)::bigint else null end,0::bigint),
        coalesce(new.base_amount_cents::bigint,0::bigint)
      )
      else coalesce(
        new.total_paid_cents::bigint,
        new.amount_paid_cents::bigint,
        case when new.total_paid_zar is not null and new.total_paid_zar > 0
          then round(new.total_paid_zar * 100)::bigint else null end,
        0::bigint
      )
    end;

    if v_financial_cap_cents >= greatest(v_legacy_cents, new.internal_earnings_cents) then
      new.cleaner_payout_cents := v_legacy_cents;
      new.payout_earnings_cents := v_legacy_cents;
      if new.payout_status = 'eligible' then
        new.payout_frozen_cents := v_legacy_cents;
      end if;
    else
      new.cleaner_payout_cents := null;
      new.payout_earnings_cents := null;
      if new.payout_status is distinct from 'eligible' then
        new.payout_frozen_cents := null;
      end if;
    end if;

    new.earnings_model_version := 'legacy_july_locked_v1';
    new.earnings_percentage_applied := null;
    new.earnings_cap_cents_applied := v_legacy_cents;
    new.earnings_tenure_months_at_assignment := null;
    new.earnings_policy_locked_at := coalesce(new.earnings_policy_locked_at, now());
  end if;

  return new;
end;
$function$;

revoke all on function public.apply_booking_earnings_policy_lock() from public, anon, authenticated;

-- A booking must exist before its FK-backed roster. Refresh the fixed pool after
-- real roster changes; do not touch historical, paid, batched or formal-team rows.
create or replace function public.refresh_current_locked_policy_after_roster()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid; v_ids uuid[];
begin
  if tg_op='INSERT' then v_ids:=array[new.booking_id];
  elsif tg_op='DELETE' then v_ids:=array[old.booking_id];
  else v_ids:=array[old.booking_id,new.booking_id]; end if;
  for v_id in select distinct x from unnest(v_ids) x order by x loop
    update public.bookings b set internal_earnings_cents=b.internal_earnings_cents
    where b.id=v_id and b.date>='2026-10-01' and b.earnings_policy='legacy_july'
      and not coalesce(b.is_team_job,false) and b.payout_status='pending'
      and b.payout_id is null and b.payout_run_id is null and b.payout_paid_at is null;
  end loop;
  return null;
end;
$$;
revoke all on function public.refresh_current_locked_policy_after_roster() from public,anon,authenticated;
create trigger booking_roster_refresh_current_locked_policy
after insert or update or delete on public.booking_cleaners
for each row execute function public.refresh_current_locked_policy_after_roster();
commit;

