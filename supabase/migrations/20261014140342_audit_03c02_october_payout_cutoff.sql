-- AUDIT-03C-02: forward processing only; no historical rows are rewritten.
begin;

create or replace function public.audit_03c02_guard_payout_batch()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid;
begin
  if TG_OP <> 'INSERT' and OLD.period_start::date < date '2026-10-01' then
    if TG_OP = 'DELETE' or NEW is distinct from OLD then
      raise exception 'historical_payout_deferred' using errcode = '23514';
    end if;
    return NEW;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  if NEW.period_start is null or NEW.period_end is null
    or NEW.period_start::date < date '2026-10-01'
    or NEW.period_start::date <> date_trunc('month', NEW.period_start::date)::date
    or NEW.period_end::date <> (date_trunc('month', NEW.period_start::date) + interval '1 month - 1 day')::date
    or NEW.period_end::date >= date_trunc('month', timezone('Africa/Johannesburg', now()))::date then
    raise exception 'closed_october_or_later_month_required' using errcode = '23514';
  end if;
  v_id := NEW.id;
  -- Lock all linked visits so a concurrent visit-date edit cannot race approval.
  perform b.id from public.bookings b where b.payout_id = v_id
    or exists (select 1 from public.booking_roster_member_payouts r where r.booking_id=b.id and r.cleaner_payout_id=v_id)
    or exists (select 1 from public.team_job_member_payouts t where t.booking_id=b.id and t.cleaner_payout_id=v_id)
    order by b.id for update;
  if exists (select 1 from public.bookings b where
    (b.payout_id=v_id
      or exists (select 1 from public.booking_roster_member_payouts r where r.booking_id=b.id and r.cleaner_payout_id=v_id)
      or exists (select 1 from public.team_job_member_payouts t where t.booking_id=b.id and t.cleaner_payout_id=v_id))
    and (b.date is null or b.date < date '2026-10-01')) then
    raise exception 'historical_payout_item_deferred' using errcode = '23514';
  end if;
  return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_payout_batch() from public;
create trigger audit_03c02_payout_batch_boundary before insert or update or delete on public.cleaner_payouts
for each row execute function public.audit_03c02_guard_payout_batch();

create or replace function public.audit_03c02_guard_payout_item()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_date date; v_changed boolean; v_payout_id uuid;
begin
  if TG_TABLE_NAME = 'bookings' then
    v_date := NEW.date;
    v_payout_id := NEW.payout_id;
    v_changed := case when TG_OP = 'INSERT' then NEW.payout_id is not null
      else NEW.payout_id is distinct from OLD.payout_id
      or NEW.payout_status is distinct from OLD.payout_status
      or NEW.payout_paid_at is distinct from OLD.payout_paid_at
      or NEW.payout_frozen_cents is distinct from OLD.payout_frozen_cents end;
    if TG_OP = 'UPDATE' and NEW.date is distinct from OLD.date
      and (NEW.date is null or NEW.date < date '2026-10-01' or OLD.date < date '2026-10-01')
      and (NEW.payout_id is not null or OLD.payout_id is not null
        or exists (select 1 from public.booking_roster_member_payouts r where r.booking_id=NEW.id and r.cleaner_payout_id is not null)
        or exists (select 1 from public.team_job_member_payouts t where t.booking_id=NEW.id and t.cleaner_payout_id is not null)) then
      raise exception 'linked_visit_cannot_cross_cutoff' using errcode = '23514';
    end if;
  else
    select b.date into v_date from public.bookings b where b.id=NEW.booking_id for update;
    if TG_TABLE_NAME = 'cleaner_earnings' then
      v_changed := case when TG_OP = 'INSERT' then NEW.disbursement_id is not null or NEW.status::text in ('processing','paid')
        else NEW.disbursement_id is distinct from OLD.disbursement_id
          or (NEW.status is distinct from OLD.status and NEW.status::text in ('processing','paid')) end;
    else
      v_payout_id := NEW.cleaner_payout_id;
      v_changed := case when TG_OP = 'INSERT' then NEW.cleaner_payout_id is not null or NEW.status::text = 'paid'
        else NEW.cleaner_payout_id is distinct from OLD.cleaner_payout_id
          or NEW.status is distinct from OLD.status end;
    end if;
  end if;
  if v_changed and v_payout_id is not null and not exists (
    select 1 from public.cleaner_payouts p where p.id=v_payout_id
      and p.period_start::date >= date '2026-10-01'
      and p.period_end::date < date_trunc('month', timezone('Africa/Johannesburg', now()))::date
  ) then
    raise exception 'historical_or_open_payout_link_forbidden' using errcode = '23514';
  end if;
  if v_changed and (v_date is null or v_date < date '2026-10-01') then
    raise exception 'historical_payout_item_deferred' using errcode = '23514';
  end if;
  if TG_TABLE_NAME = 'cleaner_earnings' and v_changed
    and v_date >= date_trunc('month', timezone('Africa/Johannesburg', now()))::date then
    raise exception 'earning_month_still_open' using errcode = '23514';
  end if;
  return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_payout_item() from public;
create trigger audit_03c02_booking_boundary before insert or update on public.bookings
for each row execute function public.audit_03c02_guard_payout_item();
create trigger audit_03c02_roster_boundary before insert or update on public.booking_roster_member_payouts
for each row execute function public.audit_03c02_guard_payout_item();
create trigger audit_03c02_team_boundary before insert or update on public.team_job_member_payouts
for each row execute function public.audit_03c02_guard_payout_item();
create trigger audit_03c02_ledger_boundary before insert or update on public.cleaner_earnings
for each row execute function public.audit_03c02_guard_payout_item();

CREATE OR REPLACE FUNCTION public.create_cleaner_payout_run_atomic(p_closed_through date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run_id uuid;
  v_ids uuid[];
  v_total bigint := 0;
  v_linked integer := 0;
  v_created_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  with locked as (
    select p.id, p.total_amount_cents
    from public.cleaner_payouts p
    where lower(coalesce(p.status::text, '')) = 'frozen'
      and p.payout_run_id is null
      and p.period_start::date >= date '2026-10-01'
      and p.period_start::date = date_trunc('month', p.period_start::date)::date
      and p.period_end::date = (date_trunc('month', p.period_start::date) + interval '1 month - 1 day')::date
      and p.period_end::date <= least(p_closed_through, (date_trunc('month', timezone('Africa/Johannesburg', now()))::date - 1))
    order by p.id
    for update
  )
  select
    array_agg(id order by id),
    coalesce(sum(greatest(coalesce(total_amount_cents, 0), 0)), 0)::bigint
  into v_ids, v_total
  from locked;

  if v_ids is null or cardinality(v_ids) = 0 then
    return null;
  end if;

  insert into public.cleaner_payout_runs (status, total_amount_cents)
  values ('draft', v_total)
  returning id, created_at into v_run_id, v_created_at;

  update public.cleaner_payouts
  set payout_run_id = v_run_id
  where id = any(v_ids)
    and payout_run_id is null
    and lower(coalesce(status::text, '')) = 'frozen';

  get diagnostics v_linked = row_count;

  if v_linked <> cardinality(v_ids) then
    raise exception 'payout run claim changed during atomic creation' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'id', v_run_id,
    'status', 'draft',
    'total_amount_cents', v_total,
    'created_at', v_created_at,
    'approved_at', null,
    'paid_at', null,
    'payout_count', v_linked
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.freeze_eligible_cleaner_payouts_atomic(p_current_month_start date, p_frozen_at timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  update public.cleaner_payouts p
  set status = 'frozen',
      frozen_at = p_frozen_at
  where lower(coalesce(p.status::text, '')) = 'pending'
    and p.payout_run_id is null
    and p.period_start::date >= date '2026-10-01'
    and p.period_start::date = date_trunc('month', p.period_start::date)::date
    and p.period_end::date = (date_trunc('month', p.period_start::date) + interval '1 month - 1 day')::date
    and p.period_end::date < least(p_current_month_start, date_trunc('month', timezone('Africa/Johannesburg', now()))::date);

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_cleaner_payout_run_atomic(p_run_id uuid, p_current_month_start date, p_approved_by uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run_status text;
  v_child_count integer := 0;
  v_invalid_count integer := 0;
  v_unfunded_count integer := 0;
  v_mismatch_count integer := 0;
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  select lower(coalesce(r.status::text, ''))
    into v_run_status
  from public.cleaner_payout_runs r
  where r.id = p_run_id
  for update;

  if not found or v_run_status <> 'draft' then
    raise exception 'Run not found or not in draft status.' using errcode = '55000';
  end if;

  perform 1
  from public.cleaner_payouts p
  where p.payout_run_id = p_run_id
  order by p.id
  for update;

  select count(*)::integer
    into v_child_count
  from public.cleaner_payouts p
  where p.payout_run_id = p_run_id;

  if v_child_count = 0 then
    raise exception 'Payout run has no cleaner payouts.' using errcode = '55000';
  end if;

  select count(*)::integer
    into v_invalid_count
  from public.cleaner_payouts p
  where p.payout_run_id = p_run_id
    and (
      lower(coalesce(p.status::text, '')) <> 'frozen'
      or p.period_start::date < date '2026-10-01'
      or p.period_start::date <> date_trunc('month', p.period_start::date)::date
      or p.period_end::date <> (date_trunc('month', p.period_start::date) + interval '1 month - 1 day')::date
      or p.period_end::date >= p_current_month_start
    );

  if v_invalid_count > 0 then
    raise exception 'Payout run contains an open, invalid, or non-frozen payout.' using errcode = '55000';
  end if;

  with payout_items as (
    select
      p.id as payout_id,
      b.cleaner_id,
      b.id as booking_id,
      0 as source_rank,
      case
        when lower(coalesce(b.payout_status::text, '')) in ('eligible', 'paid')
          and coalesce(b.payout_frozen_cents, 0) > 0
        then greatest(coalesce(b.payout_frozen_cents, 0), 0)::bigint
        else (
          greatest(coalesce(b.cleaner_payout_cents, 0), 0)
          + greatest(coalesce(b.cleaner_bonus_cents, 0), 0)
        )::bigint
      end as amount_cents
    from public.cleaner_payouts p
    join public.bookings b on b.payout_id = p.id
    where p.payout_run_id = p_run_id

    union all

    select
      p.id,
      r.cleaner_id,
      r.booking_id,
      1,
      (
        greatest(coalesce(r.payout_cents, 0), 0)
        + greatest(coalesce(r.bonus_cents, 0), 0)
      )::bigint
    from public.cleaner_payouts p
    join public.booking_roster_member_payouts r on r.cleaner_payout_id = p.id
    where p.payout_run_id = p_run_id

    union all

    select
      p.id,
      t.cleaner_id,
      t.booking_id,
      2,
      greatest(coalesce(t.payout_cents, 0), 0)::bigint
    from public.cleaner_payouts p
    join public.team_job_member_payouts t on t.cleaner_payout_id = p.id
    where p.payout_run_id = p_run_id
  ),
  authoritative as (
    select distinct on (payout_id, cleaner_id, booking_id)
      payout_id,
      cleaner_id,
      booking_id,
      amount_cents
    from payout_items
    order by payout_id, cleaner_id, booking_id, source_rank desc
  ),
  funded_items as (
    select
      a.payout_id,
      a.booking_id,
      a.amount_cents,
      case
        when b.id is null then false
        when b.refunded_at is not null then false
        when lower(coalesce(b.refund_status::text, '')) in ('refunded', 'reversed', 'failed') then false
        when (
          lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false)
          or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        ) then (
          b.monthly_invoice_id is not null
          and lower(coalesce(b.payment_status::text, '')) = 'success'
          and exists (
            select 1
            from public.monthly_invoices mi
            where mi.id = b.monthly_invoice_id
              and lower(coalesce(mi.status::text, '')) = 'paid'
          )
        )
        else lower(coalesce(b.payment_status::text, '')) in ('success', 'paid', 'succeeded')
      end as funded
    from authoritative a
    left join public.bookings b on b.id = a.booking_id
  ),
  payout_sums as (
    select
      p.id as payout_id,
      p.total_amount_cents,
      p.calculated_amount_cents,
      p.adjustment_note,
      p.amount_adjusted_at,
      p.amount_adjusted_by,
      coalesce(sum(f.amount_cents), 0)::bigint as item_total,
      coalesce(sum(case when f.funded then 0 else f.amount_cents end), 0)::bigint as funding_gap
    from public.cleaner_payouts p
    left join funded_items f on f.payout_id = p.id
    where p.payout_run_id = p_run_id
    group by
      p.id,
      p.total_amount_cents,
      p.calculated_amount_cents,
      p.adjustment_note,
      p.amount_adjusted_at,
      p.amount_adjusted_by
  )
  select
    count(*) filter (where funding_gap > 0)::integer,
    count(*) filter (
      where item_total <> greatest(coalesce(calculated_amount_cents, 0), 0)
        or (
          total_amount_cents is distinct from calculated_amount_cents
          and (
            amount_adjusted_at is null
            or amount_adjusted_by is null
            or amount_adjusted_by = p_approved_by
            or length(trim(coalesce(adjustment_note, ''))) < 3
          )
        )
    )::integer
  into v_unfunded_count, v_mismatch_count
  from payout_sums;

  if v_unfunded_count > 0 then
    raise exception 'Payout run is not fully funded by collected customer cash.' using errcode = '55000';
  end if;

  if v_mismatch_count > 0 then
    raise exception 'Payout run contains an invalid calculated total or manual adjustment, or the approver also made the adjustment.' using errcode = '55000';
  end if;

  update public.cleaner_payouts
  set status = 'approved',
      approved_at = v_now,
      approved_by = p_approved_by
  where payout_run_id = p_run_id
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'Payout run changed during approval.' using errcode = '40001';
  end if;

  get diagnostics v_invalid_count = row_count;
  if v_invalid_count <> v_child_count then
    raise exception 'Payout run changed during approval.' using errcode = '40001';
  end if;

  update public.cleaner_payout_runs
  set status = 'approved',
      approved_at = v_now
  where id = p_run_id
    and lower(coalesce(status::text, '')) = 'draft';

  if not found then
    raise exception 'Payout run changed during approval.' using errcode = '40001';
  end if;

  return v_child_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_cleaner_earnings_for_paystack(p_cleaner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_disb_id uuid;
  v_total integer;
  v_ids uuid[];
begin
  if p_cleaner_id is null then
    raise exception 'cleaner_id_required';
  end if;

  perform pg_advisory_xact_lock(910772, abs(hashtext(p_cleaner_id::text)));

  select coalesce(array_agg(id), '{}'::uuid[]), coalesce(sum(amount_cents), 0)::integer
  into v_ids, v_total
  from (
    select ce.id, ce.amount_cents
    from public.cleaner_earnings ce
    inner join public.bookings b on b.id = ce.booking_id
    where ce.cleaner_id = p_cleaner_id
      and ce.status = 'approved'
      and b.date >= date '2026-10-01'
      and b.date < date_trunc('month', timezone('Africa/Johannesburg', now()))::date
      and ce.disbursement_id is null
      and b.payout_id is null
      and lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      and b.payout_paid_at is null
      and b.refunded_at is null
      and lower(coalesce(b.refund_status, '')) not in ('refunded', 'partial_refund', 'reversed')
      and lower(coalesce(b.status, '')) = 'completed'
    order by ce.created_at asc
    for update of ce, b
  ) s;

  if v_total is null or v_total <= 0 or v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'no_approved_earnings';
  end if;

  insert into public.cleaner_earnings_disbursements (cleaner_id, total_amount_cents, status)
  values (p_cleaner_id, v_total, 'processing')
  returning id into v_disb_id;

  update public.cleaner_earnings
  set
    disbursement_id = v_disb_id,
    status = 'processing'
  where id = any(v_ids);

  return v_disb_id;
end;
$function$
;

create or replace function public.audit_03c02_guard_payout_run()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if NEW is not distinct from OLD then return NEW; end if;
  if exists (select 1 from public.cleaner_payouts p where p.payout_run_id=NEW.id
    and (p.period_start is null or p.period_start::date < date '2026-10-01')) then
    raise exception 'historical_payout_run_deferred' using errcode = '23514';
  end if;
  if NEW.status::text in ('approved','processing','paid') and (
    not exists (select 1 from public.cleaner_payouts p where p.payout_run_id=NEW.id)
    or exists (select 1 from public.cleaner_payouts p where p.payout_run_id=NEW.id
      and (p.period_start::date <> date_trunc('month', p.period_start::date)::date
        or p.period_end is null
        or p.period_end::date <> (date_trunc('month', p.period_start::date) + interval '1 month - 1 day')::date
        or p.period_end::date >= date_trunc('month', timezone('Africa/Johannesburg', now()))::date))
  ) then
    raise exception 'closed_october_or_later_run_required' using errcode = '23514';
  end if;
  return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_payout_run() from public;
create trigger audit_03c02_run_boundary before update on public.cleaner_payout_runs
for each row execute function public.audit_03c02_guard_payout_run();

commit;
