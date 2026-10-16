-- A zero lead entitlement must not block a positive roster member.
-- NULL remains the unfunded sentinel; all invoice/payment/refund/month/lock gates remain.
begin;

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
    and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') >= date '2026-10-01'
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
    and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') between p_period_start and p_period_end
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
    and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') >= date '2026-10-01'
        and coalesce(b.is_test, false) = false
        and b.cleaner_payout_cents is not null
        and b.cleaner_payout_cents >= 0
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
        and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') between p_period_start and p_period_end
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
    and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') >= date '2026-10-01'
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
        and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') between p_period_start and p_period_end
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
    and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') >= date '2026-10-01'
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
    and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') between v_period_start and v_period_end
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
    and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') >= date '2026-10-01'
        and coalesce(b.is_test, false) = false
        and b.cleaner_payout_cents is not null
        and b.cleaner_payout_cents >= 0
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
        and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') between v_period_start and v_period_end
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
    and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') >= date '2026-10-01'
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
        and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') between v_period_start and v_period_end
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

revoke all on function public.upsert_pending_payout_earnings(uuid,uuid,date,date,uuid[],uuid[],uuid[],uuid) from public,anon,authenticated;
revoke all on function public.append_draft_run_payout_earnings(uuid,uuid,uuid[],uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.upsert_pending_payout_earnings(uuid,uuid,date,date,uuid[],uuid[],uuid[],uuid) to service_role;
grant execute on function public.append_draft_run_payout_earnings(uuid,uuid,uuid[],uuid[],uuid[]) to service_role;
commit;
