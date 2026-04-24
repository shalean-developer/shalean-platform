-- Covering index for admin booking drilldown: filter by booking_id, order by created_at desc.
-- Prune function: log deleted row count to system_logs for cron observability.

create index if not exists idx_dispatch_offers_booking_created
  on public.dispatch_offers (booking_id, created_at desc)
  include (status, cleaner_id, rank_index, expires_at, responded_at, ux_variant);

comment on index public.idx_dispatch_offers_booking_created is
  'Admin dispatch-offers card: booking_id filter + created_at desc with hot columns INCLUDE.';

create or replace function public.prune_dispatch_offer_exposure_dedupe(p_retention_days int default 30)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days int := greatest(coalesce(p_retention_days, 30), 7);
  v_deleted bigint;
begin
  -- Range on inserted_at uses dispatch_offer_exposure_dedupe_inserted_at_idx (btree on inserted_at).
  with d as (
    delete from public.dispatch_offer_exposure_dedupe
    where inserted_at < (now() - make_interval(days => v_days))
    returning 1
  )
  select count(*)::bigint into v_deleted from d;

  insert into public.system_logs (level, source, message, context)
  values (
    'info',
    'prune_dispatch_offer_exposure_dedupe',
    format('Pruned %s dispatch_offer_exposure_dedupe row(s)', coalesce(v_deleted, 0)),
    jsonb_build_object(
      'deleted', coalesce(v_deleted, 0),
      'retention_days', v_days
    )
  );

  return coalesce(v_deleted, 0);
end;
$$;

comment on function public.prune_dispatch_offer_exposure_dedupe(int) is
  'Deletes exposure dedupe rows older than p_retention_days (default 30, min 7). Cron uses 30; call with 60/90 during long A/B windows. Logs deleted count to system_logs.';
