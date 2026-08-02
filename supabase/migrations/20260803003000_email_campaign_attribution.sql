-- Phase 5: campaign analytics and auditable last-touch revenue attribution.

create table if not exists public.email_campaign_attributions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  campaign_id text not null,
  message_type text,
  resend_email_id text,
  recipient_email text not null,
  interaction_type text not null,
  interaction_at timestamptz not null,
  booking_created_at timestamptz not null,
  revenue_cents integer not null default 0,
  attribution_model text not null default 'last_touch_30d',
  attributed_at timestamptz not null default now(),
  check (interaction_type in ('email.clicked','email.opened')),
  check (revenue_cents >= 0),
  check (attribution_model = 'last_touch_30d')
);

create index if not exists email_campaign_attribution_campaign_idx
  on public.email_campaign_attributions (campaign_id, booking_created_at desc);
create index if not exists email_campaign_attribution_recipient_idx
  on public.email_campaign_attributions (recipient_email, booking_created_at desc);

alter table public.email_campaign_attributions enable row level security;
revoke all on public.email_campaign_attributions from anon, authenticated;

create or replace function public.refresh_email_campaign_attributions(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 90), 365));
  v_count integer;
begin
  insert into public.email_campaign_attributions (
    booking_id, campaign_id, message_type, resend_email_id, recipient_email,
    interaction_type, interaction_at, booking_created_at, revenue_cents,
    attribution_model, attributed_at
  )
  select
    b.id,
    touch.campaign_id,
    touch.message_type,
    touch.resend_email_id,
    lower(trim(b.customer_email)),
    touch.event_type,
    touch.touch_at,
    b.created_at,
    greatest(coalesce(b.amount_paid_cents, b.total_paid_cents, b.total_paid_zar, 0), 0),
    'last_touch_30d',
    now()
  from public.bookings b
  cross join lateral (
    select
      e.campaign_id,
      e.message_type,
      e.resend_email_id,
      e.event_type,
      coalesce(e.event_created_at, e.received_at) as touch_at
    from public.email_delivery_events e
    where e.campaign_id is not null
      and e.recipient_email is not null
      and lower(trim(e.recipient_email)) = lower(trim(b.customer_email))
      and e.event_type in ('email.clicked','email.opened')
      and coalesce(e.event_created_at, e.received_at) <= b.created_at
      and coalesce(e.event_created_at, e.received_at) >= b.created_at - interval '30 days'
    order by
      case when e.event_type = 'email.clicked' then 0 else 1 end,
      coalesce(e.event_created_at, e.received_at) desc
    limit 1
  ) touch
  where b.created_at >= now() - make_interval(days => v_days)
    and b.customer_email is not null
    and coalesce(b.is_test, false) = false
  on conflict (booking_id) do update set
    campaign_id = excluded.campaign_id,
    message_type = excluded.message_type,
    resend_email_id = excluded.resend_email_id,
    recipient_email = excluded.recipient_email,
    interaction_type = excluded.interaction_type,
    interaction_at = excluded.interaction_at,
    booking_created_at = excluded.booking_created_at,
    revenue_cents = excluded.revenue_cents,
    attribution_model = excluded.attribution_model,
    attributed_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.refresh_email_campaign_attributions(integer) from public;
grant execute on function public.refresh_email_campaign_attributions(integer) to service_role;
