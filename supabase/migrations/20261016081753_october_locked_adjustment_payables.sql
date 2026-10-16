-- Forward prevention only; no existing financial records are repaired.
begin;
CREATE OR REPLACE FUNCTION public.apply_booking_earnings_policy_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_policy text := 'current_v1';
  v_legacy_cents integer;
  v_service text;
  v_financial_cap_cents bigint;
  v_participants integer := 1;
  v_lead_adjustment bigint := 0;
  v_lead_total bigint;
  v_owner uuid;
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
        where coalesce(new.cleaner_id,new.payout_owner_cleaner_id) is not null
          and not exists(select 1 from public.booking_cleaners bc where bc.booking_id=new.id)
      )
      select coalesce(sum(greatest(v_legacy_cents + coalesce((
        select sum(a.amount_cents) from public.cleaner_earnings_adjustments a
        where a.booking_id=new.id and a.cleaner_id=p.cleaner_id
      ),0),0)),0)::integer into new.internal_earnings_cents from participants p;
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
      if new.date >= '2026-10-01' and not coalesce(new.is_team_job,false) then
        v_owner:=coalesce(new.payout_owner_cleaner_id,new.cleaner_id);
        if exists(select 1 from public.booking_cleaners where booking_id=new.id)
          and not exists(select 1 from public.booking_cleaners where booking_id=new.id and cleaner_id=v_owner) then
          select cleaner_id into v_owner from public.booking_cleaners where booking_id=new.id
          order by case when role='lead' then 0 else 1 end,cleaner_id limit 1;
        end if;
        select coalesce(sum(a.amount_cents),0) into v_lead_adjustment
        from public.cleaner_earnings_adjustments a
        where a.booking_id=new.id and a.cleaner_id=v_owner;
        v_lead_total := case when v_owner is null then 0 else greatest(v_legacy_cents + v_lead_adjustment,0) end;
        new.cleaner_payout_cents := least(v_legacy_cents,v_lead_total);
        new.cleaner_bonus_cents := greatest(v_lead_total-v_legacy_cents,0);
        new.payout_earnings_cents := v_lead_total;
      else
        new.cleaner_payout_cents := v_legacy_cents;
        new.payout_earnings_cents := v_legacy_cents;
      end if;
      if new.payout_status = 'eligible' then
        new.payout_frozen_cents := coalesce(v_lead_total,v_legacy_cents);
      end if;
    else
      new.cleaner_payout_cents := null;
      new.payout_earnings_cents := null;
      if new.date >= '2026-10-01' and not coalesce(new.is_team_job,false) then new.cleaner_bonus_cents:=0; end if;
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


-- Adjustment writes and the payable representations they change commit atomically.
-- Keep frozen line items/snapshots and the noncanonical shadow ledger unchanged.
create or replace function public.refresh_current_locked_booking_policy()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_id uuid; v_ids uuid[]; b public.bookings%rowtype;
  v_lead uuid; v_base integer; v_rows jsonb; v_summary jsonb;
  v_bonus jsonb; v_deductions jsonb; v_total integer; v_written integer; v_expected integer;
begin
  if tg_table_name='bookings' then v_ids:=array[new.id];
  elsif tg_op='INSERT' then v_ids:=array[new.booking_id];
  elsif tg_op='DELETE' then v_ids:=array[old.booking_id];
  else v_ids:=array[old.booking_id,new.booking_id]; end if;
  for v_id in select distinct x from unnest(v_ids) x order by x loop
    select * into b from public.bookings where id=v_id for update;
    if not found or b.date is null or b.date<'2026-10-01'
      or b.earnings_policy is distinct from 'legacy_july' or coalesce(b.is_team_job,false)
      or b.payout_status is distinct from 'pending' or b.payout_id is not null
      or b.payout_run_id is not null or b.payout_paid_at is not null then continue; end if;
    perform 1 from public.cleaner_earnings where booking_id=v_id for update;
    perform 1 from public.booking_roster_member_payouts where booking_id=v_id for update;
    perform 1 from public.team_job_member_payouts where booking_id=v_id for update;
    if exists(select 1 from public.cleaner_earnings ce where ce.booking_id=v_id
        and (ce.status is distinct from 'pending' or ce.disbursement_id is not null or ce.paid_at is not null))
      or exists(select 1 from public.booking_roster_member_payouts mp where mp.booking_id=v_id
        and (mp.status is distinct from 'pending' or mp.cleaner_payout_id is not null))
      or exists(select 1 from public.team_job_member_payouts mp where mp.booking_id=v_id
        and (mp.status is distinct from 'pending' or mp.cleaner_payout_id is not null)) then continue; end if;
    -- Honor attribution removals and only refresh supported fixed-policy services.
    if coalesce((b.metadata->'payout_attribution_removal_v1'->>'active')::boolean,false)
      or lower(coalesce(b.service_slug,b.service,'')) not in ('standard','regular-cleaning','airbnb') then continue; end if;
    v_lead:=coalesce(b.payout_owner_cleaner_id,b.cleaner_id);
    if exists(select 1 from public.booking_cleaners where booking_id=v_id) then
      if v_lead is null or not exists(select 1 from public.booking_cleaners where booking_id=v_id and cleaner_id=v_lead) then
        select cleaner_id into v_lead from public.booking_cleaners where booking_id=v_id
        order by case when role='lead' then 0 else 1 end,cleaner_id limit 1;
      end if;
    elsif tg_table_name='booking_cleaners' and tg_op='DELETE' then
      -- A removed last roster participant cannot retain the direct payout rail.
      v_lead:=null;
    end if;
    if tg_table_name='booking_cleaners' then
      update public.bookings set cleaner_id=v_lead,payout_owner_cleaner_id=v_lead,
        internal_earnings_cents=internal_earnings_cents where id=v_id returning * into b;
    else
      update public.bookings set internal_earnings_cents=internal_earnings_cents where id=v_id returning * into b;
    end if;
    -- Reject an over-cap adjustment in the same statement. Unpaid roster/booking
    -- refreshes retain earned obligations but expose no payable member amount.
    if tg_table_name='cleaner_earnings_adjustments' and b.cleaner_payout_cents is null then
      raise exception 'payout_exceeds_financial_cap' using errcode='23514';
    end if;
    v_base:=b.display_earnings_cents;
    if coalesce(v_base,0)<=0 then raise exception 'locked_recurring_earnings_basis_invalid'; end if;
    with participants as (
      select distinct cleaner_id from public.booking_cleaners where booking_id=v_id
      union select v_lead where v_lead is not null
        and not exists(select 1 from public.booking_cleaners where booking_id=v_id)
    ), amounts as (
      select p.cleaner_id,
        coalesce(sum(greatest(a.amount_cents,0)),0)::integer as bonus,
        coalesce(sum(greatest(-a.amount_cents,0)),0)::integer as deduction
      from participants p left join public.cleaner_earnings_adjustments a
        on a.booking_id=v_id and a.cleaner_id=p.cleaner_id group by p.cleaner_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('cleaner_id',cleaner_id,
      'role',case when cleaner_id=v_lead then 'lead' else 'member' end,
      'base_earning_cents',v_base,'bonus_cents',bonus,'deduction_cents',deduction,
      'total_cents',greatest(v_base+bonus-deduction,0)) order by cleaner_id),'[]'::jsonb),
      coalesce(sum(greatest(v_base+bonus-deduction,0)),0)::integer
    into v_rows,v_total from amounts;
    -- A present summary is refreshed completely; absence remains explicit until
    -- the guarded canonical persistence flow initializes it.
    if b.earnings_summary is not null then
      select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
        'type','admin_adjustment','amount_cents',amount_cents,'reason',reason,'cleaner_id',cleaner_id) order by id),'[]'::jsonb),
        'total_cents',coalesce(sum(amount_cents),0)) into v_bonus
      from public.cleaner_earnings_adjustments where booking_id=v_id and amount_cents>0;
      select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
        'type','deduction','amount_cents',-amount_cents,'reason',reason,'cleaner_id',cleaner_id) order by id),'[]'::jsonb),
        'total_cents',coalesce(sum(-amount_cents),0)) into v_deductions
      from public.cleaner_earnings_adjustments where booking_id=v_id and amount_cents<0;
      v_summary:=b.earnings_summary || jsonb_build_object('per_cleaner_earnings',v_rows,
        'assigned_cleaner_ids',(select coalesce(jsonb_agg(r->'cleaner_id'),'[]'::jsonb) from jsonb_array_elements(v_rows) r),
        'cleaner_count',jsonb_array_length(v_rows),'team_leader_id',v_lead,
        'minimum_earning_cents',v_base,'maximum_earning_cents',v_base,
        'cleaner_percentage',null,'cleaner_tenure_months',null,
        'team_leader_earning_cents',(select (r->>'total_cents')::integer from jsonb_array_elements(v_rows) r where r->>'cleaner_id'=v_lead::text),
        'bonus',v_bonus,'deductions',v_deductions,'total_cleaner_earnings_cents',v_total,
        'company_revenue_cents',greatest(coalesce((b.earnings_summary->>'customer_total_cents')::integer,0)-v_total-coalesce((b.earnings_summary->>'costs_cents')::integer,0),0),
        'computed_at',clock_timestamp());
      update public.bookings set earnings_summary=v_summary,
        company_revenue_cents=(v_summary->>'company_revenue_cents')::integer where id=v_id;
    end if;
    delete from public.booking_roster_member_payouts mp where mp.booking_id=v_id
      and (mp.cleaner_id=v_lead or not exists(select 1 from jsonb_array_elements(v_rows) r
        where r->>'cleaner_id'=mp.cleaner_id::text));
    select count(*) into v_expected from jsonb_array_elements(v_rows) r
      where r->>'cleaner_id' is distinct from v_lead::text;
    insert into public.booking_roster_member_payouts(booking_id,cleaner_id,payout_cents,bonus_cents,status)
    select v_id,(r->>'cleaner_id')::uuid,
      case when b.cleaner_payout_cents is null then 0 else least(v_base,(r->>'total_cents')::integer) end,
      case when b.cleaner_payout_cents is null then 0 else greatest((r->>'total_cents')::integer-v_base,0) end,'pending'
    from jsonb_array_elements(v_rows) r where r->>'cleaner_id' is distinct from v_lead::text
    on conflict(booking_id,cleaner_id) do update
      set payout_cents=excluded.payout_cents,bonus_cents=excluded.bonus_cents
      where public.booking_roster_member_payouts.status='pending'
        and public.booking_roster_member_payouts.cleaner_payout_id is null;
    get diagnostics v_written=row_count;
    if v_written<>v_expected then raise exception 'locked_recurring_member_payout_changed' using errcode='40001'; end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.refresh_current_locked_booking_policy() from public,anon,authenticated;
-- A previously unpaid visit can become payable without another roster/adjustment
-- write. The refresh updates internal/summary columns only, so it cannot recurse
-- through this column-specific trigger.
create trigger booking_financial_refresh_current_locked_policy
after update of recurring_id,customer_id,service,service_slug,display_earnings_cents,
  billing_type,is_monthly_billing_booking,monthly_invoice_id,total_paid_cents,
  total_paid_zar,amount_paid_cents,payment_status,base_amount_cents on public.bookings
for each row execute function public.refresh_current_locked_booking_policy();
commit;
