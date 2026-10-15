-- AUDIT-03C-02 explicit RPC fences and historical amount preservation.
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
    and (b.date::date is null or b.date::date < NEW.period_start::date or b.date::date > NEW.period_end::date)) then
    raise exception 'historical_payout_item_deferred' using errcode = '23514';
  end if;
  return NEW;
end; $$;

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
      or NEW.payout_frozen_cents is distinct from OLD.payout_frozen_cents
      or NEW.cleaner_payout_cents is distinct from OLD.cleaner_payout_cents
      or NEW.cleaner_bonus_cents is distinct from OLD.cleaner_bonus_cents end;
    if TG_OP = 'UPDATE' and NEW.date is distinct from OLD.date
      and ((OLD.date::date < date '2026-10-01' and lower(coalesce(OLD.status::text,'')) = 'completed')
        or exists (select 1 from public.cleaner_earnings ce where ce.booking_id=NEW.id and (ce.disbursement_id is not null or ce.status::text in ('processing','paid')))
        or NEW.payout_id is not null or OLD.payout_id is not null
        or exists (select 1 from public.booking_roster_member_payouts r where r.booking_id=NEW.id and r.cleaner_payout_id is not null)
        or exists (select 1 from public.team_job_member_payouts t where t.booking_id=NEW.id and t.cleaner_payout_id is not null)) then
      raise exception 'linked_visit_cannot_cross_cutoff' using errcode = '23514';
    end if;
  else
    select b.date::date into v_date from public.bookings b where b.id=NEW.booking_id for update;
    if TG_TABLE_NAME = 'cleaner_earnings' then
      v_changed := case when TG_OP = 'INSERT' then NEW.disbursement_id is not null or NEW.status::text in ('processing','paid')
        else NEW.disbursement_id is distinct from OLD.disbursement_id
          or (NEW.status is distinct from OLD.status and NEW.status::text in ('processing','paid'))
          or NEW.amount_cents is distinct from OLD.amount_cents end;
    else
      v_payout_id := NEW.cleaner_payout_id;
      v_changed := case when TG_OP = 'INSERT' then NEW.cleaner_payout_id is not null or NEW.status::text = 'paid'
        else NEW.cleaner_payout_id is distinct from OLD.cleaner_payout_id
          or NEW.status is distinct from OLD.status
          or NEW.payout_cents is distinct from OLD.payout_cents end;
      if TG_TABLE_NAME = 'booking_roster_member_payouts' and TG_OP = 'UPDATE' then
        v_changed := v_changed or NEW.bonus_cents is distinct from OLD.bonus_cents;
      end if;
    end if;
  end if;
  if v_changed and v_payout_id is not null and not exists (
    select 1 from public.cleaner_payouts p where p.id=v_payout_id
      and p.period_start::date >= date '2026-10-01'
      and v_date between p.period_start::date and p.period_end::date
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
create or replace function public.audit_03c02_assert_closed_period(p_start date, p_end date)
returns void language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if p_start is null or p_end is null or p_start < date '2026-10-01'
    or p_start <> date_trunc('month', p_start)::date
    or p_end <> (date_trunc('month', p_start) + interval '1 month - 1 day')::date
    or p_end >= date_trunc('month', timezone('Africa/Johannesburg', now()))::date then
    raise exception 'closed_october_or_later_month_required' using errcode = '23514';
  end if;
end; $$;
revoke all on function public.audit_03c02_assert_closed_period(date,date) from public;

CREATE OR REPLACE FUNCTION public.upsert_pending_payout_earnings(p_payout_id uuid, p_cleaner_id uuid, p_period_start date, p_period_end date, p_direct_booking_ids uuid[], p_roster_ids uuid[], p_team_ids uuid[], p_created_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_payout_id uuid := p_payout_id;
  v_created boolean := false;
  v_direct_count integer := 0;
  v_roster_count integer := 0;
  v_team_count integer := 0;
  v_linked integer := 0;
  v_total bigint := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  perform public.audit_03c02_assert_closed_period(p_period_start, p_period_end);

  -- Match visit-edit lock order: candidate bookings first, then payout batch.
  perform 1
  from public.bookings b
  where b.id in (
    select unnest(coalesce(p_direct_booking_ids, array[]::uuid[]))
    union
    select r.booking_id
    from public.booking_roster_member_payouts r
    where r.id = any(coalesce(p_roster_ids, array[]::uuid[]))
    union
    select t.booking_id
    from public.team_job_member_payouts t
    where t.id = any(coalesce(p_team_ids, array[]::uuid[]))
  )
  order by b.id
  for update;

  if v_payout_id is null then
    insert into public.cleaner_payouts (
      cleaner_id,
      total_amount_cents,
      calculated_amount_cents,
      status,
      period_start,
      period_end,
      created_by
    )
    values (
      p_cleaner_id,
      0,
      0,
      'pending',
      p_period_start,
      p_period_end,
      p_created_by
    )
    returning id into v_payout_id;
    v_created := true;
  else
    perform 1
    from public.cleaner_payouts p
    where p.id = v_payout_id
      and p.cleaner_id = p_cleaner_id
      and p.period_start::date = p_period_start
      and p.period_end::date = p_period_end
      and lower(coalesce(p.status::text, '')) = 'pending'
      and p.payout_run_id is null
    for update;

    if not found then
      raise exception 'pending payout % is no longer editable', v_payout_id using errcode = '55000';
    end if;
  end if;

  update public.bookings b
  set payout_id = v_payout_id
  where b.id = any(coalesce(p_direct_booking_ids, array[]::uuid[]))
    and b.cleaner_id = p_cleaner_id
    and b.payout_id is null
    and lower(coalesce(b.status::text, '')) = 'completed'
    and b.date::date >= date '2026-10-01'
    and coalesce(b.is_test, false) = false
    and coalesce(b.cleaner_payout_cents, 0) > 0
    and b.refunded_at is null
    and lower(coalesce(b.refund_status::text, '')) not in
      ('refunded', 'full', 'partial', 'chargeback', 'reversed', 'failed_after_success')
    and not (
      lower(coalesce(b.metadata -> 'payout_attribution_removal_v1' ->> 'active', '')) = 'true'
      and (
        coalesce(nullif(b.cleaner_id::text, ''), nullif(b.payout_owner_cleaner_id::text, ''), '') = ''
        or coalesce(nullif(b.cleaner_id::text, ''), nullif(b.payout_owner_cleaner_id::text, ''), '') = coalesce(
          nullif(b.metadata -> 'payout_attribution_removal_v1' ->> 'header_cleaner_id_at_removal', ''),
          b.metadata -> 'payout_attribution_removal_v1' ->> 'cleaner_id'
        )
      )
    )
    and b.date::date between p_period_start and p_period_end
    and (
      (
        (
          lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false)
          or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and b.monthly_invoice_id is not null
        and exists (
          select 1
          from public.monthly_invoices mi
          where mi.id = b.monthly_invoice_id
            and lower(coalesce(mi.status::text, '')) = 'paid'
        )
        and lower(coalesce(b.payment_status::text, '')) = 'success'
        and lower(coalesce(b.payout_status::text, '')) = 'eligible'
        and b.payout_frozen_cents is not null
      )
      or
      (
        not (
          lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false)
          or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and lower(coalesce(b.payment_status::text, '')) in ('success', 'paid', 'succeeded')
      )
    )
    and not exists (
      select 1
      from public.cleaner_earnings ce
      where ce.booking_id = b.id
        and (
          ce.disbursement_id is not null
          or lower(coalesce(ce.status::text, '')) in ('paid', 'claimed', 'disbursed')
        )
    );
  get diagnostics v_direct_count = row_count;

  update public.booking_roster_member_payouts r
  set cleaner_payout_id = v_payout_id,
      status = 'batched'
  where r.id = any(coalesce(p_roster_ids, array[]::uuid[]))
    and r.cleaner_id = p_cleaner_id
    and r.cleaner_payout_id is null
    and lower(coalesce(r.status::text, '')) = 'pending'
    and greatest(coalesce(r.payout_cents, 0), 0) + greatest(coalesce(r.bonus_cents, 0), 0) > 0
    and exists (
      select 1
      from public.bookings b
      where b.id = r.booking_id
        and lower(coalesce(b.status::text, '')) = 'completed'
    and b.date::date >= date '2026-10-01'
        and coalesce(b.is_test, false) = false
        and coalesce(b.cleaner_payout_cents, 0) > 0
        and b.refunded_at is null
        and lower(coalesce(b.refund_status::text, '')) not in
          ('refunded', 'full', 'partial', 'chargeback', 'reversed', 'failed_after_success')
        and not (
          lower(coalesce(b.metadata -> 'payout_attribution_removal_v1' ->> 'active', '')) = 'true'
          and (
            coalesce(nullif(b.cleaner_id::text, ''), nullif(b.payout_owner_cleaner_id::text, ''), '') = ''
            or coalesce(nullif(b.cleaner_id::text, ''), nullif(b.payout_owner_cleaner_id::text, ''), '') = coalesce(
              nullif(b.metadata -> 'payout_attribution_removal_v1' ->> 'header_cleaner_id_at_removal', ''),
              b.metadata -> 'payout_attribution_removal_v1' ->> 'cleaner_id'
            )
          )
        )
        and b.date::date between p_period_start and p_period_end
        and (
          (
            (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            )
            and b.monthly_invoice_id is not null
            and exists (
              select 1
              from public.monthly_invoices mi
              where mi.id = b.monthly_invoice_id
                and lower(coalesce(mi.status::text, '')) = 'paid'
            )
            and lower(coalesce(b.payment_status::text, '')) = 'success'
            and lower(coalesce(b.payout_status::text, '')) = 'eligible'
            and b.payout_frozen_cents is not null
          )
          or
          (
            not (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            )
            and lower(coalesce(b.payment_status::text, '')) in ('success', 'paid', 'succeeded')
          )
        )
    );
  get diagnostics v_roster_count = row_count;

  update public.team_job_member_payouts t
  set cleaner_payout_id = v_payout_id,
      status = 'batched'
  where t.id = any(coalesce(p_team_ids, array[]::uuid[]))
    and t.cleaner_id = p_cleaner_id
    and t.cleaner_payout_id is null
    and lower(coalesce(t.status::text, '')) = 'pending'
    and greatest(coalesce(t.payout_cents, 0), 0) > 0
    and exists (
      select 1
      from public.bookings b
      where b.id = t.booking_id
        and lower(coalesce(b.status::text, '')) = 'completed'
    and b.date::date >= date '2026-10-01'
        and coalesce(b.is_test, false) = false
        and b.refunded_at is null
        and lower(coalesce(b.refund_status::text, '')) not in
          ('refunded', 'full', 'partial', 'chargeback', 'reversed', 'failed_after_success')
        and not (
          lower(coalesce(b.metadata -> 'payout_attribution_removal_v1' ->> 'active', '')) = 'true'
          and (
            coalesce(nullif(b.cleaner_id::text, ''), nullif(b.payout_owner_cleaner_id::text, ''), '') = ''
            or coalesce(nullif(b.cleaner_id::text, ''), nullif(b.payout_owner_cleaner_id::text, ''), '') = coalesce(
              nullif(b.metadata -> 'payout_attribution_removal_v1' ->> 'header_cleaner_id_at_removal', ''),
              b.metadata -> 'payout_attribution_removal_v1' ->> 'cleaner_id'
            )
          )
        )
        and b.date::date between p_period_start and p_period_end
        and (
          (
            (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            )
            and b.monthly_invoice_id is not null
            and exists (
              select 1
              from public.monthly_invoices mi
              where mi.id = b.monthly_invoice_id
                and lower(coalesce(mi.status::text, '')) = 'paid'
            )
            and lower(coalesce(b.payment_status::text, '')) = 'success'
            and lower(coalesce(b.payout_status::text, '')) = 'eligible'
            and b.payout_frozen_cents is not null
          )
          or
          (
            not (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            )
            and lower(coalesce(b.payment_status::text, '')) in ('success', 'paid', 'succeeded')
          )
        )
    );
  get diagnostics v_team_count = row_count;

  v_linked := v_direct_count + v_roster_count + v_team_count;

  if v_linked = 0 then
    if v_created then
      delete from public.cleaner_payouts where id = v_payout_id;
      return jsonb_build_object(
        'payout_id', null,
        'created', false,
        'linked_count', 0,
        'total_amount_cents', 0
      );
    end if;

    return jsonb_build_object(
      'payout_id', v_payout_id,
      'created', false,
      'linked_count', 0,
      'total_amount_cents', (
        select greatest(coalesce(p.total_amount_cents, 0), 0)
        from public.cleaner_payouts p
        where p.id = v_payout_id
      )
    );
  end if;

  with payout_items as (
    select
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
    from public.bookings b
    where b.payout_id = v_payout_id

    union all

    select
      r.cleaner_id,
      r.booking_id,
      1,
      (
        greatest(coalesce(r.payout_cents, 0), 0)
        + greatest(coalesce(r.bonus_cents, 0), 0)
      )::bigint
    from public.booking_roster_member_payouts r
    where r.cleaner_payout_id = v_payout_id

    union all

    select
      t.cleaner_id,
      t.booking_id,
      2,
      greatest(coalesce(t.payout_cents, 0), 0)::bigint
    from public.team_job_member_payouts t
    where t.cleaner_payout_id = v_payout_id
  ),
  authoritative as (
    select distinct on (cleaner_id, booking_id)
      cleaner_id,
      booking_id,
      amount_cents
    from payout_items
    order by cleaner_id, booking_id, source_rank desc
  )
  select coalesce(sum(amount_cents), 0)::bigint
    into v_total
  from authoritative;

  update public.cleaner_payouts
  set total_amount_cents = v_total,
      calculated_amount_cents = v_total,
      adjustment_note = null,
      amount_adjusted_at = null,
      amount_adjusted_by = null
  where id = v_payout_id
    and lower(coalesce(status::text, '')) = 'pending'
    and payout_run_id is null;

  if not found then
    raise exception 'pending payout % changed before reconciliation', v_payout_id using errcode = '40001';
  end if;

  return jsonb_build_object(
    'payout_id', v_payout_id,
    'created', v_created,
    'linked_count', v_linked,
    'total_amount_cents', v_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.append_draft_run_payout_earnings(p_payout_id uuid, p_cleaner_id uuid, p_direct_booking_ids uuid[], p_roster_ids uuid[], p_team_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run_id uuid;
  v_payout_status text;
  v_run_status text;
  v_payout_cleaner_id uuid;
  v_period_start date;
  v_period_end date;
  v_direct_count integer := 0;
  v_roster_count integer := 0;
  v_team_count integer := 0;
  v_linked_count integer := 0;
  v_total bigint := 0;
  v_run_total bigint := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  -- Global lock order for payout mutation paths: booking(s) first, then run,
  -- then child payout. This matches visit-edit flows and avoids deadlocks.
  perform 1
  from public.bookings b
  where b.id in (
    select unnest(coalesce(p_direct_booking_ids, array[]::uuid[]))
    union
    select r.booking_id
    from public.booking_roster_member_payouts r
    where r.id = any(coalesce(p_roster_ids, array[]::uuid[]))
    union
    select t.booking_id
    from public.team_job_member_payouts t
    where t.id = any(coalesce(p_team_ids, array[]::uuid[]))
  )
  order by b.id
  for update;

  select p.payout_run_id
    into v_run_id
  from public.cleaner_payouts p
  where p.id = p_payout_id;

  if not found then
    raise exception 'cleaner payout % not found', p_payout_id using errcode = 'P0002';
  end if;

  if v_run_id is null then
    raise exception 'cleaner payout % is not attached to a payout run', p_payout_id using errcode = '55000';
  end if;

  -- Match approval lock order: parent run first, then child payout.
  select lower(coalesce(r.status::text, ''))
    into v_run_status
  from public.cleaner_payout_runs r
  where r.id = v_run_id
  for update;

  if not found or v_run_status <> 'draft' then
    raise exception 'payout run % is no longer draft', v_run_id using errcode = '55000';
  end if;

  select
    lower(coalesce(p.status::text, '')),
    p.cleaner_id,
    p.period_start::date,
    p.period_end::date
  into
    v_payout_status,
    v_payout_cleaner_id,
    v_period_start,
    v_period_end
  from public.cleaner_payouts p
  where p.id = p_payout_id
    and p.payout_run_id = v_run_id
  for update;

  if not found or v_payout_status <> 'frozen' then
    raise exception 'cleaner payout % is no longer a frozen child of run %', p_payout_id, v_run_id
      using errcode = '55000';
  end if;

  if v_payout_cleaner_id is distinct from p_cleaner_id then
    raise exception 'cleaner payout % does not belong to cleaner %', p_payout_id, p_cleaner_id using errcode = '22023';
  end if;

  perform public.audit_03c02_assert_closed_period(v_period_start, v_period_end);

  -- Revalidate the same authoritative eligibility boundary inside this transaction.
  -- JavaScript discovery is advisory; only rows still payable at mutation time may link.
  update public.bookings b
  set payout_id = p_payout_id
  where b.id = any(coalesce(p_direct_booking_ids, array[]::uuid[]))
    and b.cleaner_id = p_cleaner_id
    and b.payout_id is null
    and lower(coalesce(b.status::text, '')) = 'completed'
    and b.date::date >= date '2026-10-01'
    and coalesce(b.is_test, false) = false
    and coalesce(b.cleaner_payout_cents, 0) > 0
    and b.refunded_at is null
    and lower(coalesce(b.refund_status::text, '')) not in
      ('refunded', 'full', 'partial', 'chargeback', 'reversed', 'failed_after_success')
    and not (
      lower(coalesce(b.metadata -> 'payout_attribution_removal_v1' ->> 'active', '')) = 'true'
      and (
        coalesce(
          nullif(b.cleaner_id::text, ''),
          nullif(b.payout_owner_cleaner_id::text, ''),
          ''
        ) = ''
        or coalesce(
          nullif(b.cleaner_id::text, ''),
          nullif(b.payout_owner_cleaner_id::text, ''),
          ''
        ) = coalesce(
          nullif(b.metadata -> 'payout_attribution_removal_v1' ->> 'header_cleaner_id_at_removal', ''),
          b.metadata -> 'payout_attribution_removal_v1' ->> 'cleaner_id'
        )
      )
    )
    and b.date::date between v_period_start and v_period_end
    and (
      (
        (
          lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false)
          or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and b.monthly_invoice_id is not null
        and exists (
          select 1
          from public.monthly_invoices mi
          where mi.id = b.monthly_invoice_id
            and lower(coalesce(mi.status::text, '')) = 'paid'
        )
        and lower(coalesce(b.payment_status::text, '')) = 'success'
        and lower(coalesce(b.payout_status::text, '')) = 'eligible'
        and b.payout_frozen_cents is not null
      )
      or
      (
        not (
          lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false)
          or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and lower(coalesce(b.payment_status::text, '')) in ('success', 'paid', 'succeeded')
      )
    )
    and not exists (
      select 1
      from public.cleaner_earnings ce
      where ce.booking_id = b.id
        and (
          ce.disbursement_id is not null
          or lower(coalesce(ce.status::text, '')) in ('paid', 'claimed', 'disbursed')
        )
    );
  get diagnostics v_direct_count = row_count;

  update public.booking_roster_member_payouts r
  set cleaner_payout_id = p_payout_id,
      status = 'batched'
  where r.id = any(coalesce(p_roster_ids, array[]::uuid[]))
    and r.cleaner_id = p_cleaner_id
    and r.cleaner_payout_id is null
    and lower(coalesce(r.status::text, '')) = 'pending'
    and greatest(coalesce(r.payout_cents, 0), 0) + greatest(coalesce(r.bonus_cents, 0), 0) > 0
    and exists (
      select 1
      from public.bookings b
      where b.id = r.booking_id
        and lower(coalesce(b.status::text, '')) = 'completed'
    and b.date::date >= date '2026-10-01'
        and coalesce(b.is_test, false) = false
        and coalesce(b.cleaner_payout_cents, 0) > 0
        and b.refunded_at is null
        and lower(coalesce(b.refund_status::text, '')) not in
          ('refunded', 'full', 'partial', 'chargeback', 'reversed', 'failed_after_success')
        and not (
          lower(coalesce(b.metadata -> 'payout_attribution_removal_v1' ->> 'active', '')) = 'true'
          and (
            coalesce(
              nullif(b.cleaner_id::text, ''),
              nullif(b.payout_owner_cleaner_id::text, ''),
              ''
            ) = ''
            or coalesce(
              nullif(b.cleaner_id::text, ''),
              nullif(b.payout_owner_cleaner_id::text, ''),
              ''
            ) = coalesce(
              nullif(b.metadata -> 'payout_attribution_removal_v1' ->> 'header_cleaner_id_at_removal', ''),
              b.metadata -> 'payout_attribution_removal_v1' ->> 'cleaner_id'
            )
          )
        )
        and b.date::date between v_period_start and v_period_end
        and (
          (
            (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            )
            and b.monthly_invoice_id is not null
            and exists (
              select 1
              from public.monthly_invoices mi
              where mi.id = b.monthly_invoice_id
                and lower(coalesce(mi.status::text, '')) = 'paid'
            )
            and lower(coalesce(b.payment_status::text, '')) = 'success'
            and lower(coalesce(b.payout_status::text, '')) = 'eligible'
            and b.payout_frozen_cents is not null
          )
          or
          (
            not (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            )
            and lower(coalesce(b.payment_status::text, '')) in ('success', 'paid', 'succeeded')
          )
        )
    );
  get diagnostics v_roster_count = row_count;

  update public.team_job_member_payouts t
  set cleaner_payout_id = p_payout_id,
      status = 'batched'
  where t.id = any(coalesce(p_team_ids, array[]::uuid[]))
    and t.cleaner_id = p_cleaner_id
    and t.cleaner_payout_id is null
    and lower(coalesce(t.status::text, '')) = 'pending'
    and greatest(coalesce(t.payout_cents, 0), 0) > 0
    and exists (
      select 1
      from public.bookings b
      where b.id = t.booking_id
        and lower(coalesce(b.status::text, '')) = 'completed'
    and b.date::date >= date '2026-10-01'
        and coalesce(b.is_test, false) = false
        and b.refunded_at is null
        and lower(coalesce(b.refund_status::text, '')) not in
          ('refunded', 'full', 'partial', 'chargeback', 'reversed', 'failed_after_success')
        and not (
          lower(coalesce(b.metadata -> 'payout_attribution_removal_v1' ->> 'active', '')) = 'true'
          and (
            coalesce(
              nullif(b.cleaner_id::text, ''),
              nullif(b.payout_owner_cleaner_id::text, ''),
              ''
            ) = ''
            or coalesce(
              nullif(b.cleaner_id::text, ''),
              nullif(b.payout_owner_cleaner_id::text, ''),
              ''
            ) = coalesce(
              nullif(b.metadata -> 'payout_attribution_removal_v1' ->> 'header_cleaner_id_at_removal', ''),
              b.metadata -> 'payout_attribution_removal_v1' ->> 'cleaner_id'
            )
          )
        )
        and b.date::date between v_period_start and v_period_end
        and (
          (
            (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            )
            and b.monthly_invoice_id is not null
            and exists (
              select 1
              from public.monthly_invoices mi
              where mi.id = b.monthly_invoice_id
                and lower(coalesce(mi.status::text, '')) = 'paid'
            )
            and lower(coalesce(b.payment_status::text, '')) = 'success'
            and lower(coalesce(b.payout_status::text, '')) = 'eligible'
            and b.payout_frozen_cents is not null
          )
          or
          (
            not (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            )
            and lower(coalesce(b.payment_status::text, '')) in ('success', 'paid', 'succeeded')
          )
        )
    );
  get diagnostics v_team_count = row_count;

  v_linked_count := v_direct_count + v_roster_count + v_team_count;
  if v_linked_count = 0 then
    return 0;
  end if;

  with payout_items as (
    select
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
    from public.bookings b
    where b.payout_id = p_payout_id

    union all

    select
      r.cleaner_id,
      r.booking_id,
      1 as source_rank,
      (
        greatest(coalesce(r.payout_cents, 0), 0)
        + greatest(coalesce(r.bonus_cents, 0), 0)
      )::bigint as amount_cents
    from public.booking_roster_member_payouts r
    where r.cleaner_payout_id = p_payout_id

    union all

    select
      t.cleaner_id,
      t.booking_id,
      2 as source_rank,
      greatest(coalesce(t.payout_cents, 0), 0)::bigint as amount_cents
    from public.team_job_member_payouts t
    where t.cleaner_payout_id = p_payout_id
  ),
  authoritative as (
    select distinct on (cleaner_id, booking_id)
      cleaner_id,
      booking_id,
      amount_cents
    from payout_items
    order by cleaner_id, booking_id, source_rank desc
  )
  select coalesce(sum(amount_cents), 0)::bigint
    into v_total
  from authoritative;

  update public.cleaner_payouts
  set payout_run_id = null
  where id = p_payout_id
    and payout_run_id = v_run_id
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % changed before reconciliation', p_payout_id using errcode = '40001';
  end if;

  update public.cleaner_payouts
  set total_amount_cents = v_total,
      calculated_amount_cents = v_total,
      adjustment_note = null,
      amount_adjusted_at = null,
      amount_adjusted_by = null
  where id = p_payout_id
    and payout_run_id is null
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % could not be reconciled', p_payout_id using errcode = '40001';
  end if;

  update public.cleaner_payouts
  set payout_run_id = v_run_id
  where id = p_payout_id
    and payout_run_id is null
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % could not be restored to payout run %', p_payout_id, v_run_id
      using errcode = '40001';
  end if;

  select coalesce(sum(greatest(coalesce(p.total_amount_cents, 0), 0)), 0)::bigint
    into v_run_total
  from public.cleaner_payouts p
  where p.payout_run_id = v_run_id
    and lower(coalesce(p.status::text, '')) <> 'cancelled';

  update public.cleaner_payout_runs
  set total_amount_cents = v_run_total
  where id = v_run_id
    and lower(coalesce(status::text, '')) = 'draft';

  if not found then
    raise exception 'payout run % changed before reconciliation', v_run_id using errcode = '40001';
  end if;

  return v_linked_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_cleaner_payout_bank_transfer(p_payout_id uuid, p_paid_by uuid, p_reference text, p_paid_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payout public.cleaner_payouts%rowtype;
  v_reference text := trim(coalesce(p_reference, ''));
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_parent_run_id uuid;
  v_booking_run_id uuid;
  v_remaining integer;
  v_locked_run uuid;
  v_item_count integer;
  v_item_total bigint;
begin
  if p_payout_id is null then
    raise exception 'payout_id_required';
  end if;
  if p_paid_by is null then
    raise exception 'paid_by_required';
  end if;
  if length(v_reference) < 3 then
    raise exception 'bank_reference_required';
  end if;

  select *
  into v_payout
  from public.cleaner_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'payout_not_found';
  end if;

  -- Idempotent retry for the same already-recorded bank settlement.
  if v_payout.status = 'paid'
     and v_payout.payment_method = 'bank_transfer'
     and coalesce(v_payout.payment_reference, '') = v_reference then
    return true;
  end if;

  perform public.audit_03c02_assert_closed_period(v_payout.period_start, v_payout.period_end);

  if v_payout.status <> 'approved' then
    raise exception 'payout_not_approved';
  end if;

  if lower(coalesce(v_payout.payment_status, '')) = 'processing' then
    raise exception 'paystack_transfer_in_flight';
  end if;

  if exists (
    select 1
    from public.payout_transfers pt
    where pt.payout_id = p_payout_id
      and lower(coalesce(pt.status, '')) <> 'failed'
  ) then
    raise exception 'paystack_transfer_exists';
  end if;

  -- Any active or unresolved Paystack outbox intent must block bank settlement,
  -- even when a legacy payout_transfers audit row is already marked failed.
  if exists (
    select 1
    from public.payout_transfer_outbox pto
    where pto.rail = 'cleaner_payout'
      and pto.subject_id = p_payout_id
      and (
        lower(coalesce(pto.status, '')) in ('pending', 'sending', 'submitted', 'needs_reconcile', 'succeeded')
        or (
          lower(coalesce(pto.status, '')) = 'failed'
          and lower(coalesce(pto.last_error, '')) ~ '(duplicate|already|reference)'
        )
      )
  ) then
    raise exception 'paystack_transfer_in_flight';
  end if;

  if not exists (
    select 1
    from public.cleaner_payment_details cpd
    where cpd.cleaner_id = v_payout.cleaner_id
      and length(trim(coalesce(cpd.account_number, ''))) >= 6
      and length(trim(coalesce(cpd.bank_code, ''))) >= 2
      and length(trim(coalesce(cpd.account_name, ''))) >= 2
  ) then
    raise exception 'bank_details_missing';
  end if;

  if (v_paid_at at time zone 'Africa/Johannesburg')::date >
     (now() at time zone 'Africa/Johannesburg')::date then
    raise exception 'future_paid_at_not_allowed';
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.payout_id = p_payout_id
      and b.cleaner_id is distinct from v_payout.cleaner_id
  ) or exists (
    select 1
    from public.booking_roster_member_payouts rp
    where rp.cleaner_payout_id = p_payout_id
      and rp.cleaner_id is distinct from v_payout.cleaner_id
  ) or exists (
    select 1
    from public.team_job_member_payouts tj
    where tj.cleaner_payout_id = p_payout_id
      and tj.cleaner_id is distinct from v_payout.cleaner_id
  ) then
    raise exception 'payout_cleaner_mismatch';
  end if;

  with raw_items as (
    select
      b.id as booking_id,
      0 as source_rank,
      case
        when lower(coalesce(b.payout_status, '')) in ('eligible', 'paid')
             and coalesce(b.payout_frozen_cents, 0) > 0
          then coalesce(b.payout_frozen_cents, 0)::bigint
        else (coalesce(b.cleaner_payout_cents, 0) + coalesce(b.cleaner_bonus_cents, 0))::bigint
      end as amount_cents
    from public.bookings b
    where b.payout_id = p_payout_id

    union all

    select
      rp.booking_id,
      1 as source_rank,
      (coalesce(rp.payout_cents, 0) + coalesce(rp.bonus_cents, 0))::bigint
    from public.booking_roster_member_payouts rp
    where rp.cleaner_payout_id = p_payout_id

    union all

    select
      tj.booking_id,
      2 as source_rank,
      coalesce(tj.payout_cents, 0)::bigint
    from public.team_job_member_payouts tj
    where tj.cleaner_payout_id = p_payout_id
  ),
  ranked_items as (
    select
      booking_id,
      amount_cents,
      row_number() over (partition by booking_id order by source_rank desc) as rn
    from raw_items
  )
  select count(*)::integer, coalesce(sum(amount_cents), 0)::bigint
  into v_item_count, v_item_total
  from ranked_items
  where rn = 1;

  if coalesce(v_item_count, 0) = 0 then
    raise exception 'payout_has_no_earning_items';
  end if;

  if coalesce(v_payout.total_amount_cents, 0) <= 0 then
    raise exception 'payout_amount_not_positive';
  end if;

  if v_payout.amount_adjusted_at is null
     and v_item_total <> coalesce(v_payout.total_amount_cents, 0)::bigint then
    raise exception 'payout_total_mismatch';
  end if;

  if v_payout.amount_adjusted_at is not null
     and length(trim(coalesce(v_payout.adjustment_note, ''))) < 3 then
    raise exception 'payout_adjustment_reason_required';
  end if;

  -- Revalidate every earning line transactionally at settlement time. Approval
  -- can precede a later cancellation/refund, so bank settlement must not pay a
  -- liability the Paystack rail would reject.
  --
  -- Lock the linked booking rows first. Refund/cancellation writers must acquire
  -- the same row locks before committing their booking mutation, preventing a
  -- refund from racing between this eligibility check and the paid update.
  perform b.id
  from public.bookings b
  where (
    b.payout_id = p_payout_id
    or exists (
      select 1
      from public.booking_roster_member_payouts rp
      where rp.cleaner_payout_id = p_payout_id
        and rp.booking_id = b.id
    )
    or exists (
      select 1
      from public.team_job_member_payouts tj
      where tj.cleaner_payout_id = p_payout_id
        and tj.booking_id = b.id
    )
  )
  for update of b;

  if exists (
    select 1
    from public.bookings b
    where (
      b.payout_id = p_payout_id
      or exists (
        select 1
        from public.booking_roster_member_payouts rp
        where rp.cleaner_payout_id = p_payout_id
          and rp.booking_id = b.id
      )
      or exists (
        select 1
        from public.team_job_member_payouts tj
        where tj.cleaner_payout_id = p_payout_id
          and tj.booking_id = b.id
      )
    )
      and (
        lower(coalesce(b.status, '')) <> 'completed'
        or b.is_test is true
        or b.refunded_at is not null
        or lower(coalesce(b.refund_status, '')) in ('refunded', 'partial_refund', 'partial', 'full', 'reversed', 'chargeback')
        or exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(b.booking_snapshot->'refund_workflow'->'records') = 'array'
                then b.booking_snapshot->'refund_workflow'->'records'
              else '[]'::jsonb
            end
          ) as refund_record
          where lower(coalesce(refund_record->>'provider_state', '')) in ('pending', 'submitted_to_provider')
        )
      )
  ) then
    raise exception 'linked_earning_no_longer_payable';
  end if;

  update public.cleaner_payouts
  set
    status = 'paid',
    paid_at = v_paid_at,
    payment_status = 'success',
    payment_method = 'bank_transfer',
    payment_reference = v_reference,
    paid_by = p_paid_by
  where id = p_payout_id
    and status = 'approved';

  if not found then
    raise exception 'payout_state_changed';
  end if;

  -- bookings.payout_run_id is a required reconciliation UUID for paid bookings.
  -- It is intentionally not an FK to cleaner_payout_runs, but the parent run id
  -- is a stable shared reconciliation id when one exists.
  v_parent_run_id := v_payout.payout_run_id;
  v_booking_run_id := coalesce(v_parent_run_id, gen_random_uuid());

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = v_paid_at,
    payout_run_id = coalesce(b.payout_run_id, v_booking_run_id)
  where b.payout_id = p_payout_id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
      or b.payout_run_id is null
    );

  update public.booking_roster_member_payouts rp
  set status = 'paid'
  where rp.cleaner_payout_id = p_payout_id
    and rp.status is distinct from 'paid';

  update public.team_job_member_payouts tj
  set status = 'paid'
  where tj.cleaner_payout_id = p_payout_id
    and tj.status is distinct from 'paid';

  if v_parent_run_id is not null then
    -- Serialize settlements in the same parent run so the final-child count
    -- cannot race and leave a fully paid run stuck in processing.
    select id
    into v_locked_run
    from public.cleaner_payout_runs
    where id = v_parent_run_id
    for update;

    if found then
      update public.cleaner_payout_runs
      set status = 'processing'
      where id = v_parent_run_id
        and status = 'approved';

      select count(*)
      into v_remaining
      from public.cleaner_payouts
      where payout_run_id = v_parent_run_id
        and status <> 'paid';

      if v_remaining = 0 then
        update public.cleaner_payout_runs
        set status = 'paid',
            paid_at = coalesce(paid_at, v_paid_at)
        where id = v_parent_run_id
          and status in ('approved', 'processing');
      end if;
    end if;
  end if;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.adjust_unrun_member_payout_earnings(p_booking_id uuid, p_cleaner_id uuid, p_payout_cents bigint, p_bonus_cents bigint, p_booking_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_payout_id uuid;
  v_current_direct_payout_id uuid;
  v_total bigint;
  v_last_total bigint := null;
  v_synced_ids uuid[] := array[]::uuid[];
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  if p_payout_cents < 0 or p_bonus_cents < 0 then
    raise exception 'payout and bonus must be non-negative' using errcode = '22003';
  end if;

  if p_booking_patch is null then
    p_booking_patch := '{}'::jsonb;
  end if;

  -- Lock the visit row before touching any of its financial representations.
  select b.payout_id
    into v_current_direct_payout_id
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'booking % not found', p_booking_id using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.bookings b where b.id=p_booking_id and b.date::date >= date '2026-10-01') then
    raise exception 'historical_payout_item_deferred' using errcode = '23514';
  end if;

  -- Lock every currently linked member payout first. If createPayoutRun won the
  -- race, fail before any member mutation. If this transaction wins, the payout
  -- rows remain locked until member updates and payout-total reconciliation commit.
  for v_payout_id in
    select distinct x.payout_id
    from (
      select v_current_direct_payout_id as payout_id
      where v_current_direct_payout_id is not null
      union
      select t.cleaner_payout_id as payout_id
      from public.team_job_member_payouts t
      where t.booking_id = p_booking_id
        and t.cleaner_id = p_cleaner_id
        and t.cleaner_payout_id is not null
      union
      select r.cleaner_payout_id as payout_id
      from public.booking_roster_member_payouts r
      where r.booking_id = p_booking_id
        and r.cleaner_id = p_cleaner_id
        and r.cleaner_payout_id is not null
    ) x
    where x.payout_id is not null
    order by x.payout_id
  loop
    perform 1
    from public.cleaner_payouts p
    where p.id = v_payout_id
      and p.payout_run_id is null
      and lower(coalesce(p.status::text, '')) in ('pending', 'frozen')
    for update;

    if not found then
      raise exception 'member payout % is locked or attached to a disbursement run', v_payout_id
        using errcode = '55000';
    end if;
  end loop;

  update public.team_job_member_payouts t
  set payout_cents = p_payout_cents
  where t.booking_id = p_booking_id
    and t.cleaner_id = p_cleaner_id
    and lower(coalesce(t.status::text, '')) in ('pending', 'batched');

  update public.booking_roster_member_payouts r
  set payout_cents = p_payout_cents,
      bonus_cents = p_bonus_cents
  where r.booking_id = p_booking_id
    and r.cleaner_id = p_cleaner_id
    and lower(coalesce(r.status::text, '')) in ('pending', 'batched');

  -- Keep booking-wide financial representations in the same transaction as
  -- member earnings and payout totals. Missing JSON keys preserve old values;
  -- present JSON nulls intentionally clear nullable columns.
  update public.bookings b
  set earnings_summary = case
        when p_booking_patch ? 'earnings_summary' then p_booking_patch -> 'earnings_summary'
        else b.earnings_summary
      end,
      cleaner_earnings_total_cents = case
        when p_booking_patch ? 'cleaner_earnings_total_cents'
          then (p_booking_patch ->> 'cleaner_earnings_total_cents')::bigint
        else b.cleaner_earnings_total_cents
      end,
      company_revenue_cents = case
        when p_booking_patch ? 'company_revenue_cents'
          then (p_booking_patch ->> 'company_revenue_cents')::bigint
        else b.company_revenue_cents
      end,
      cleaner_payout_cents = case
        when p_booking_patch ? 'cleaner_payout_cents'
          then (p_booking_patch ->> 'cleaner_payout_cents')::bigint
        else b.cleaner_payout_cents
      end,
      cleaner_bonus_cents = case
        when p_booking_patch ? 'cleaner_bonus_cents'
          then (p_booking_patch ->> 'cleaner_bonus_cents')::bigint
        else b.cleaner_bonus_cents
      end,
      display_earnings_cents = case
        when p_booking_patch ? 'display_earnings_cents'
          then (p_booking_patch ->> 'display_earnings_cents')::bigint
        else b.display_earnings_cents
      end,
      payout_frozen_cents = case
        when p_booking_patch ? 'payout_frozen_cents'
          then (p_booking_patch ->> 'payout_frozen_cents')::bigint
        else b.payout_frozen_cents
      end
  where b.id = p_booking_id;

  if not found then
    raise exception 'booking % changed before atomic member adjustment', p_booking_id using errcode = '40001';
  end if;

  for v_payout_id in
    select distinct x.payout_id
    from (
      select v_current_direct_payout_id as payout_id
      where v_current_direct_payout_id is not null
      union
      select t.cleaner_payout_id as payout_id
      from public.team_job_member_payouts t
      where t.booking_id = p_booking_id
        and t.cleaner_id = p_cleaner_id
        and t.cleaner_payout_id is not null
      union
      select r.cleaner_payout_id as payout_id
      from public.booking_roster_member_payouts r
      where r.booking_id = p_booking_id
        and r.cleaner_id = p_cleaner_id
        and r.cleaner_payout_id is not null
    ) x
    where x.payout_id is not null
    order by x.payout_id
  loop
    with payout_items as (
      select
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
      from public.bookings b
      where b.payout_id = v_payout_id

      union all

      select
        r.cleaner_id,
        r.booking_id,
        1 as source_rank,
        (
          greatest(coalesce(r.payout_cents, 0), 0)
          + greatest(coalesce(r.bonus_cents, 0), 0)
        )::bigint
      from public.booking_roster_member_payouts r
      where r.cleaner_payout_id = v_payout_id

      union all

      select
        t.cleaner_id,
        t.booking_id,
        2 as source_rank,
        greatest(coalesce(t.payout_cents, 0), 0)::bigint
      from public.team_job_member_payouts t
      where t.cleaner_payout_id = v_payout_id
    ),
    authoritative as (
      select distinct on (cleaner_id, booking_id)
        cleaner_id,
        booking_id,
        amount_cents
      from payout_items
      order by cleaner_id, booking_id, source_rank desc
    )
    select coalesce(sum(amount_cents), 0)::bigint
      into v_total
    from authoritative;

    update public.cleaner_payouts
    set total_amount_cents = v_total,
        calculated_amount_cents = v_total,
        adjustment_note = null,
        amount_adjusted_at = null,
        amount_adjusted_by = null
    where id = v_payout_id
      and payout_run_id is null
      and lower(coalesce(status::text, '')) in ('pending', 'frozen');

    if not found then
      raise exception 'member payout % became locked before reconciliation', v_payout_id
        using errcode = '40001';
    end if;

    v_last_total := v_total;
    v_synced_ids := array_append(v_synced_ids, v_payout_id);
  end loop;

  return jsonb_build_object(
    'batch_total_cents', v_last_total,
    'synced_payout_ids', to_jsonb(v_synced_ids)
  );
end;
$function$
;

commit;
