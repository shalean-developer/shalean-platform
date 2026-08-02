-- Prevent parallel cron workers from sending the same deferred payment-link email twice.

alter table if exists public.conversion_deferred_payment_link_emails
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_token uuid;

create index if not exists conversion_deferred_payment_link_emails_due_claim_idx
  on public.conversion_deferred_payment_link_emails (run_at, processing_started_at)
  where sent_at is null;

create or replace function public.claim_due_deferred_payment_link_emails(
  p_limit integer default 25,
  p_stale_after interval default interval '15 minutes'
)
returns setof public.conversion_deferred_payment_link_emails
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select q.id
    from public.conversion_deferred_payment_link_emails q
    where q.sent_at is null
      and q.run_at <= now()
      and (
        q.processing_started_at is null
        or q.processing_started_at < now() - p_stale_after
      )
    order by q.run_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 50))
  ), claimed as (
    update public.conversion_deferred_payment_link_emails q
    set processing_started_at = now(),
        processing_token = gen_random_uuid()
    from due
    where q.id = due.id
    returning q.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_due_deferred_payment_link_emails(integer, interval) from public;
grant execute on function public.claim_due_deferred_payment_link_emails(integer, interval) to service_role;
