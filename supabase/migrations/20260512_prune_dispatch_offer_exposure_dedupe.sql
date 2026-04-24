-- Retention for Postgres fallback exposure dedupe (when Redis is not used).
-- Monthly pg_cron job (only scheduled if extension exists).

create index if not exists dispatch_offer_exposure_dedupe_inserted_at_idx
  on public.dispatch_offer_exposure_dedupe (inserted_at asc);

comment on index public.dispatch_offer_exposure_dedupe_inserted_at_idx is
  'Supports prune: DELETE … WHERE inserted_at < (now() - interval) uses btree range scan on inserted_at.';

create or replace function public.prune_dispatch_offer_exposure_dedupe(p_retention_days int default 30)
returns bigint
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from public.dispatch_offer_exposure_dedupe
    where inserted_at < (now() - make_interval(days => greatest(coalesce(p_retention_days, 30), 7)))
    returning 1
  )
  select coalesce((select count(*)::bigint from d), 0::bigint);
$$;

comment on function public.prune_dispatch_offer_exposure_dedupe(int) is
  'Deletes exposure dedupe rows older than p_retention_days (default 30). Minimum retention 7 days.';

revoke all on function public.prune_dispatch_offer_exposure_dedupe(int) from public;
grant execute on function public.prune_dispatch_offer_exposure_dedupe(int) to service_role;

do $$
declare
  r record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  for r in
    select jobid
    from cron.job
    where jobname = 'prune-dispatch-offer-exposure-dedupe'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
  perform cron.schedule(
    'prune-dispatch-offer-exposure-dedupe',
    '0 4 1 * *',
    'select public.prune_dispatch_offer_exposure_dedupe(30);'
  );
end
$$;
