-- MASTER-03A — atomically reconcile late earnings into a frozen payout whose
-- parent payout run is still DRAFT.
--
-- Do not redefine the MASTER-00B frozen-payout trigger here. MASTER-00B
-- permanently owns that security contract. Instead this service-role-only RPC
-- performs the existing detach/update/reattach sequence inside one PostgreSQL
-- transaction, so a failure or process exit rolls back the whole sequence.




create or replace function public.append_draft_run_payout_earnings(
  p_payout_id uuid,
  p_cleaner_id uuid,
  p_direct_booking_ids uuid[],
  p_roster_ids uuid[],
  p_team_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

  select
    p.payout_run_id,
    lower(coalesce(p.status::text, '')),
    p.cleaner_id,
    p.period_start::date,
    p.period_end::date
  into
    v_run_id,
    v_payout_status,
    v_payout_cleaner_id,
    v_period_start,
    v_period_end
  from public.cleaner_payouts p
  where p.id = p_payout_id
  for update;

  if not found then
    raise exception 'cleaner payout % not found', p_payout_id using errcode = 'P0002';
  end if;

  if v_payout_status <> 'frozen' or v_run_id is null then
    raise exception 'cleaner payout % is not a frozen run payout', p_payout_id using errcode = '55000';
  end if;

  if v_payout_cleaner_id is distinct from p_cleaner_id then
    raise exception 'cleaner payout % does not belong to cleaner %', p_payout_id, p_cleaner_id using errcode = '22023';
  end if;

  select lower(coalesce(r.status::text, ''))
    into v_run_status
  from public.cleaner_payout_runs r
  where r.id = v_run_id
  for update;

  if not found or v_run_status <> 'draft' then
    raise exception 'payout run % is no longer draft', v_run_id using errcode = '55000';
  end if;

  -- Revalidate the same authoritative eligibility boundary inside this transaction.
  -- JavaScript discovery is advisory; only rows still payable at mutation time may link.
  perform 1
  from public.bookings b
  where b.id in (
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

  update public.bookings b
  set payout_id = p_payout_id
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
    ) between v_period_start and v_period_end
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
        ) between v_period_start and v_period_end
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
        ) between v_period_start and v_period_end
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
$$;

revoke all on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) from public;
revoke all on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) from anon;
revoke all on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) from authenticated;
grant execute on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) to service_role;

comment on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) is
  'Service-role-only MASTER-03A operation: atomically links late earning rows to a frozen payout in a DRAFT run, recomputes the authoritative payout total, and recomputes the run total.';


create or replace function public.adjust_unrun_member_payout_earnings(
  p_booking_id uuid,
  p_cleaner_id uuid,
  p_payout_cents bigint,
  p_bonus_cents bigint,
  p_booking_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
$$;

revoke all on function public.adjust_unrun_member_payout_earnings(uuid, uuid, bigint, bigint, jsonb) from public;
revoke all on function public.adjust_unrun_member_payout_earnings(uuid, uuid, bigint, bigint, jsonb) from anon;
revoke all on function public.adjust_unrun_member_payout_earnings(uuid, uuid, bigint, bigint, jsonb) from authenticated;
grant execute on function public.adjust_unrun_member_payout_earnings(uuid, uuid, bigint, bigint, jsonb) to service_role;

comment on function public.adjust_unrun_member_payout_earnings(uuid, uuid, bigint, bigint, jsonb) is
  'MASTER-03A: atomically locks unrun member payout batches, updates team/roster earnings, and reconciles payout totals so createPayoutRun cannot race the edit.';


create or replace function public.create_cleaner_payout_run_atomic(
  p_closed_through date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
      and p.period_start::date >= date '2026-07-01'
      and p.period_start::date = date_trunc('month', p.period_start::date)::date
      and p.period_end::date = (date_trunc('month', p.period_start::date) + interval '1 month - 1 day')::date
      and p.period_end::date <= p_closed_through
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
$$;

revoke all on function public.create_cleaner_payout_run_atomic(date) from public;
revoke all on function public.create_cleaner_payout_run_atomic(date) from anon;
revoke all on function public.create_cleaner_payout_run_atomic(date) from authenticated;
grant execute on function public.create_cleaner_payout_run_atomic(date) to service_role;

comment on function public.create_cleaner_payout_run_atomic(date) is
  'MASTER-03A: locks eligible closed-month frozen payouts, computes the total, creates the DRAFT run, and attaches payouts in one transaction.';


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
    and b.payout_id is null;
  get diagnostics v_direct_count = row_count;

  update public.booking_roster_member_payouts r
  set cleaner_payout_id = v_payout_id,
      status = 'batched'
  where r.id = any(coalesce(p_roster_ids, array[]::uuid[]))
    and r.cleaner_id = p_cleaner_id
    and r.cleaner_payout_id is null
    and lower(coalesce(r.status::text, '')) = 'pending';
  get diagnostics v_roster_count = row_count;

  update public.team_job_member_payouts t
  set cleaner_payout_id = v_payout_id,
      status = 'batched'
  where t.id = any(coalesce(p_team_ids, array[]::uuid[]))
    and t.cleaner_id = p_cleaner_id
    and t.cleaner_payout_id is null
    and lower(coalesce(t.status::text, '')) = 'pending';
  get diagnostics v_team_count = row_count;

  v_linked := v_direct_count + v_roster_count + v_team_count;

  if v_linked = 0 and v_created then
    delete from public.cleaner_payouts where id = v_payout_id;
    return jsonb_build_object(
      'payout_id', null,
      'created', false,
      'linked_count', 0,
      'total_amount_cents', 0
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
  'MASTER-03A: atomically creates/locks a pending payout, links all supplied earning rows, and reconciles its authoritative total.';
