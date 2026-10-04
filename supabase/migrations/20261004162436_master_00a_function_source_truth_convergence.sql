-- MASTER-00A — final database function source-of-truth convergence.
-- Reassert only functions whose current environment definitions drifted from
-- the canonical repository/runtime contract. No customer, booking, invoice,
-- payout, or accounting rows are mutated by this migration.

create or replace function public.populate_daily_analytics_rollups(p_day date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote_views int;
  v_payment_reached int;
  v_distinct_sessions int;
  v_pay_open int;
  v_book_done int;
  v_bc_direct int;
  v_starts int;
  v_completed int;
  v_pay_init int;
  v_pay_done int;
  v_abandon numeric;
begin
  select quote_views, payment_step_reached, distinct_sessions
    into v_quote_views, v_payment_reached, v_distinct_sessions
  from public.mv_booking_funnel_daily
  where day = p_day;

  select paystack_opened, booking_completed_events
    into v_pay_open, v_book_done
  from public.mv_payment_conversion_daily
  where day = p_day;

  select count(*)::int
    into v_bc_direct
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day
    and event_type = 'booking_completed';

  insert into public.daily_booking_funnel_metrics (
    day, quote_starts, payment_reached, booking_completed_signals,
    paystack_opened, paystack_completed, unique_sessions, updated_at
  ) values (
    p_day, coalesce(v_quote_views, 0), coalesce(v_payment_reached, 0),
    coalesce(v_bc_direct, 0), coalesce(v_pay_open, 0), coalesce(v_book_done, 0),
    coalesce(v_distinct_sessions, 0), now()
  ) on conflict (day) do update set
    quote_starts = excluded.quote_starts,
    payment_reached = excluded.payment_reached,
    booking_completed_signals = excluded.booking_completed_signals,
    paystack_opened = excluded.paystack_opened,
    paystack_completed = excluded.paystack_completed,
    unique_sessions = excluded.unique_sessions,
    updated_at = excluded.updated_at;

  select count(*)::int into v_starts from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'booking_started';
  select count(*)::int into v_completed from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'booking_completed';
  select count(*)::int into v_pay_init from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'payment_initiated';
  select count(*)::int into v_pay_done from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'payment_completed';

  insert into public.daily_conversion_metrics (
    day, booking_started, booking_completed, payment_initiated, payment_completed, updated_at
  ) values (
    p_day, coalesce(v_starts, 0), coalesce(v_completed, 0),
    coalesce(v_pay_init, 0), coalesce(v_pay_done, 0), now()
  ) on conflict (day) do update set
    booking_started = excluded.booking_started,
    booking_completed = excluded.booking_completed,
    payment_initiated = excluded.payment_initiated,
    payment_completed = excluded.payment_completed,
    updated_at = excluded.updated_at;

  v_abandon := case
    when coalesce(v_pay_open, 0) > 0 then
      round(((v_pay_open - coalesce(v_book_done, 0))::numeric / v_pay_open::numeric) * 100, 2)
    else null
  end;

  insert into public.daily_payment_metrics (
    day, paystack_opened, payment_failed_signals, abandonment_pct, updated_at
  ) values (
    p_day, coalesce(v_pay_open, 0), 0, v_abandon, now()
  ) on conflict (day) do update set
    paystack_opened = excluded.paystack_opened,
    payment_failed_signals = excluded.payment_failed_signals,
    abandonment_pct = excluded.abandonment_pct,
    updated_at = excluded.updated_at;

  delete from public.daily_service_metrics where day = p_day;

  with event_metrics as (
    select
      coalesce(
        nullif(ue.payload ->> 'service_type', ''),
        nullif(ue.payload ->> 'service_slug', ''),
        nullif(b.service_slug, ''),
        nullif(b.service, '')
      ) as service_slug,
      count(*) filter (where ue.event_type = 'booking_started')::int as booking_starts,
      count(*) filter (where ue.event_type = 'booking_completed')::int as completions
    from public.user_events ue
    left join public.bookings b on b.id = ue.booking_id
    where (ue.created_at at time zone 'UTC')::date = p_day
      and ue.event_type in ('booking_started', 'booking_completed')
    group by 1
  ), revenue_metrics as (
    select
      coalesce(nullif(b.service_slug, ''), nullif(b.service, '')) as service_slug,
      sum(coalesce(
        b.total_paid_cents,
        b.amount_paid_cents,
        round(coalesce(b.total_price, 0) * 100)::int,
        0
      ))::numeric / 100 as revenue_zar
    from public.bookings b
    where coalesce(
      (b.paid_at at time zone 'UTC')::date,
      (b.payment_completed_at at time zone 'UTC')::date,
      (b.created_at at time zone 'UTC')::date
    ) = p_day
      and coalesce(b.payment_status, '') in ('success', 'paid')
    group by 1
  ), service_rollup as (
    select
      coalesce(e.service_slug, r.service_slug) as service_slug,
      coalesce(e.booking_starts, 0) as booking_starts,
      coalesce(e.completions, 0) as completions,
      coalesce(r.revenue_zar, 0) as revenue_zar
    from event_metrics e
    full join revenue_metrics r using (service_slug)
  )
  insert into public.daily_service_metrics (
    day, service_slug, booking_starts, completions, revenue_zar, updated_at
  )
  select p_day, service_slug, booking_starts, completions, revenue_zar, now()
  from service_rollup
  where service_slug is not null;
end;
$function$;

create or replace function public.reserve_cleaning_credit_for_booking(
  p_user_id uuid,
  p_booking_id uuid,
  p_amount_zar numeric
)
returns table (ok boolean, reservation_id uuid, amount_zar numeric, balance_after_zar numeric, status text, error_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.cleaning_credit_reservations%rowtype;
  v_current numeric;
  v_amount numeric := round(greatest(coalesce(p_amount_zar,0),0)::numeric,2);
  v_after numeric;
begin
  if p_user_id is null or p_booking_id is null or v_amount <= 0 then
    return query select false,null::uuid,0::numeric,0::numeric,null::text,'invalid_reservation_request'; return;
  end if;
  select * into v_existing from public.cleaning_credit_reservations where booking_id=p_booking_id for update;
  if found then
    if v_existing.user_id <> p_user_id then
      return query select false,v_existing.id,v_existing.amount_zar,0::numeric,v_existing.status,'booking_reservation_owner_mismatch'; return;
    end if;
    select coalesce(credit_balance_zar,0) into v_current from public.user_profiles where id=p_user_id;
    return query select true,v_existing.id,v_existing.amount_zar,coalesce(v_current,0),v_existing.status,null::text; return;
  end if;
  select coalesce(credit_balance_zar,0) into v_current from public.user_profiles where id=p_user_id for update;
  if not found then return query select false,null::uuid,0::numeric,0::numeric,null::text,'user_not_found'; return; end if;
  if v_current < v_amount then return query select false,null::uuid,0::numeric,v_current,null::text,'insufficient_credit'; return; end if;
  v_after := round((v_current-v_amount)*100)/100;
  update public.user_profiles set credit_balance_zar=v_after where id=p_user_id;
  insert into public.cleaning_credit_reservations(booking_id,user_id,amount_zar)
    values(p_booking_id,p_user_id,v_amount) returning id into reservation_id;
  return query select true,reservation_id,v_amount,v_after,'reserved'::text,null::text;
end; $$;

create or replace function public.settle_cleaning_credit_for_booking(p_booking_id uuid)
returns table (ok boolean, reservation_id uuid, status text, error_message text)
language plpgsql security definer set search_path=public
as $$
declare v public.cleaning_credit_reservations%rowtype;
begin
  select * into v from public.cleaning_credit_reservations where booking_id=p_booking_id for update;
  if not found then return query select false,null::uuid,null::text,'reservation_not_found'; return; end if;
  if v.status='settled' then return query select true,v.id,v.status,null::text; return; end if;
  if v.status='released' then return query select false,v.id,v.status,'reservation_already_released'; return; end if;
  insert into public.cleaning_credit_transactions(user_id,amount_zar,balance_after_zar,type,booking_id,note,created_by)
    select v.user_id,-v.amount_zar,coalesce(p.credit_balance_zar,0),'spend',v.booking_id,
      'Settled Cleaning Credit reservation','checkout_reservation'
    from public.user_profiles p where p.id=v.user_id;
  update public.cleaning_credit_reservations set status='settled',settled_at=now(),updated_at=now() where id=v.id;
  return query select true,v.id,'settled'::text,null::text;
end; $$;

create or replace function public.release_cleaning_credit_for_booking(p_booking_id uuid)
returns table (ok boolean, reservation_id uuid, status text, error_message text)
language plpgsql security definer set search_path=public
as $$
declare v public.cleaning_credit_reservations%rowtype; v_after numeric;
begin
  select * into v from public.cleaning_credit_reservations where booking_id=p_booking_id for update;
  if not found then return query select false,null::uuid,null::text,'reservation_not_found'; return; end if;
  if v.status='released' then return query select true,v.id,v.status,null::text; return; end if;
  if v.status='settled' then return query select false,v.id,v.status,'reservation_already_settled'; return; end if;
  select coalesce(credit_balance_zar,0) into v_after from public.user_profiles where id=v.user_id for update;
  v_after := round((v_after+v.amount_zar)*100)/100;
  update public.user_profiles set credit_balance_zar=v_after where id=v.user_id;
  update public.cleaning_credit_reservations set status='released',released_at=now(),updated_at=now() where id=v.id;
  return query select true,v.id,'released'::text,null::text;
end; $$;

CREATE OR REPLACE FUNCTION public.invoke_nextjs_cron(cron_path text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg record;
  v_url text;
  v_path text;
  v_req_id bigint;
begin
  if cron_path is null or btrim(cron_path) = '' then
    raise exception 'cron_path is required';
  end if;

  v_path := cron_path;
  if left(v_path, 1) <> '/' then
    v_path := '/' || v_path;
  end if;

  select app_base_url, cron_secret
  into v_cfg
  from public.cron_http_targets
  where singleton
  limit 1;

  if v_cfg is null then
    raise exception 'cron_http_targets row missing';
  end if;

  if nullif(btrim(v_cfg.app_base_url), '') is null
     or v_cfg.app_base_url !~ '^https://'
     or nullif(btrim(v_cfg.cron_secret), '') is null then
    raise exception 'cron_http_targets is not configured with a secure non-empty HTTPS target and secret';
  end if;

  v_url := rtrim(v_cfg.app_base_url, '/') || v_path;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cfg.cron_secret,
      'x-cron-secret', v_cfg.cron_secret
    ),
    body := '{}'::jsonb
  )
  into v_req_id;

  return v_req_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.retry_unassigned_jobs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req_id bigint;
begin
  -- Fail closed through the governed singleton configuration. The baseline must
  -- never embed an environment URL or cron credential.
  v_req_id := public.invoke_nextjs_cron('/api/cron/retry-failed-jobs');

  insert into public.dispatch_logs (source, level, message, context)
  values (
    'retry_unassigned_jobs',
    'info',
    'triggered http retry-failed-jobs',
    jsonb_build_object('pg_net_request_id', v_req_id)
  );

  return jsonb_build_object(
    'ok', true,
    'pg_net_request_id', v_req_id,
    'ran_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'retry_unassigned_jobs',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$function$;

-- Preserve least-privilege execution for privileged helpers.
revoke all on function public.invoke_nextjs_cron(text) from public, anon, authenticated;
grant execute on function public.invoke_nextjs_cron(text) to service_role;

revoke all on function public.retry_unassigned_jobs() from public, anon, authenticated;
grant execute on function public.retry_unassigned_jobs() to service_role;

revoke all on function public.reserve_cleaning_credit_for_booking(uuid,uuid,numeric) from public, anon, authenticated;
revoke all on function public.settle_cleaning_credit_for_booking(uuid) from public, anon, authenticated;
revoke all on function public.release_cleaning_credit_for_booking(uuid) from public, anon, authenticated;
grant execute on function public.reserve_cleaning_credit_for_booking(uuid,uuid,numeric) to service_role;
grant execute on function public.settle_cleaning_credit_for_booking(uuid) to service_role;
grant execute on function public.release_cleaning_credit_for_booking(uuid) to service_role;
