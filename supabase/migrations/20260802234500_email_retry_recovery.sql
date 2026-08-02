-- Phase 3: durable email retry and recovery center.

create table if not exists public.email_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text unique,
  recipient_email text not null,
  sender_email text not null,
  subject text not null,
  html_body text,
  text_body text,
  reply_to jsonb not null default '[]'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  booking_id uuid,
  customer_id uuid,
  message_type text,
  campaign_id text,
  delivery_status text not null default 'sending',
  failure_reason text,
  retry_status text not null default 'none',
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  last_retry_at timestamptz,
  retry_locked_at timestamptz,
  retry_lock_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (retry_count >= 0),
  check (retry_status in ('none','queued','processing','recovered','exhausted','blocked'))
);

create index if not exists email_outbound_retry_due_idx
  on public.email_outbound_messages (next_retry_at, created_at)
  where retry_status = 'queued';
create index if not exists email_outbound_booking_idx on public.email_outbound_messages (booking_id, created_at desc) where booking_id is not null;
create index if not exists email_outbound_customer_idx on public.email_outbound_messages (customer_id, created_at desc) where customer_id is not null;
create index if not exists email_outbound_recipient_idx on public.email_outbound_messages (recipient_email, created_at desc);

alter table public.email_outbound_messages enable row level security;
revoke all on public.email_outbound_messages from anon, authenticated;

create or replace function public.claim_email_retries(p_limit integer default 20)
returns setof public.email_outbound_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  return query
  with due as (
    select id
    from public.email_outbound_messages
    where retry_status = 'queued'
      and next_retry_at <= now()
      and retry_count < 4
      and (retry_locked_at is null or retry_locked_at < now() - interval '15 minutes')
    order by next_retry_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.email_outbound_messages m
  set retry_status = 'processing', retry_locked_at = now(), retry_lock_token = v_token, updated_at = now()
  from due
  where m.id = due.id
  returning m.*;
end;
$$;

revoke all on function public.claim_email_retries(integer) from public;
grant execute on function public.claim_email_retries(integer) to service_role;
