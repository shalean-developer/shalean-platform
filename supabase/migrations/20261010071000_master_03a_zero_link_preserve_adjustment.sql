-- MASTER-03A follow-up: preserve an existing pending payout unchanged when
-- transactional revalidation finds zero new eligible earning rows.
create or replace function public.upsert_pending_payout_earnings(
  p_payout_id uuid,
  p_cleaner_id uuid,
  p_period_start date,
  p_period_end date,
  p_direct_booking_ids uuid[],
  p_roster_ids uuid[],
  p_team_ids uuid[],
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
    and (
      case
        when (
          lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false)
          or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        ) and b.date is not null
          then b.date::date
        when b.date is not null
          and b.completed_at is not null
          and date_trunc('week', b.date::date) <> date_trunc('week', b.completed_at::date)
          then b.date::date
        when b.completed_at is not null
          then b.completed_at::date
        else b.date::date
      end
    ) between p_period_start and p_period_end
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
        and (
          case
            when (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            ) and b.date is not null
              then b.date::date
            when b.date is not null
              and b.completed_at is not null
              and date_trunc('week', b.date::date) <> date_trunc('week', b.completed_at::date)
              then b.date::date
            when b.completed_at is not null
              then b.completed_at::date
            else b.date::date
          end
        ) between p_period_start and p_period_end
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
        and (
          case
            when (
              lower(coalesce(b.billing_type::text, '')) in ('recurring_invoice', 'monthly_contract', 'pay_later')
              or coalesce(b.is_monthly_billing_booking, false)
              or lower(coalesce(b.payment_status::text, '')) = 'pending_monthly'
              or b.monthly_invoice_id is not null
            ) and b.date is not null
              then b.date::date
            when b.date is not null
              and b.completed_at is not null
              and date_trunc('week', b.date::date) <> date_trunc('week', b.completed_at::date)
              then b.date::date
            when b.completed_at is not null
              then b.completed_at::date
            else b.date::date
          end
        ) between p_period_start and p_period_end
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
$$;


revoke all on function public.upsert_pending_payout_earnings(uuid, uuid, date, date, uuid[], uuid[], uuid[], uuid) from public;
revoke all on function public.upsert_pending_payout_earnings(uuid, uuid, date, date, uuid[], uuid[], uuid[], uuid) from anon;
revoke all on function public.upsert_pending_payout_earnings(uuid, uuid, date, date, uuid[], uuid[], uuid[], uuid) from authenticated;
grant execute on function public.upsert_pending_payout_earnings(uuid, uuid, date, date, uuid[], uuid[], uuid[], uuid) to service_role;

comment on function public.upsert_pending_payout_earnings(uuid, uuid, date, date, uuid[], uuid[], uuid[], uuid) is
  'MASTER-03A follow-up: atomically links only still-eligible pending earnings; zero-link calls preserve existing payout totals and manual adjustment metadata.';
