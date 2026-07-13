-- Server-side dedupe for `dispatch.offer.exposed` (at-most-once per offer via PK).
-- Composite index for variant × time dashboards.
-- Optional CHECK keeps ux_variant aligned with app enum.

create table if not exists public.dispatch_offer_exposure_dedupe (
  offer_id uuid primary key references public.dispatch_offers (id) on delete cascade,
  inserted_at timestamptz not null default now()
);

comment on table public.dispatch_offer_exposure_dedupe is
  'Insert-once row per offer for exposure metric dedupe (Postgres fallback when Redis is not configured).';

alter table public.dispatch_offer_exposure_dedupe enable row level security;

revoke all on public.dispatch_offer_exposure_dedupe from public;
revoke all on public.dispatch_offer_exposure_dedupe from anon;
revoke all on public.dispatch_offer_exposure_dedupe from authenticated;
grant select, insert on public.dispatch_offer_exposure_dedupe to service_role;

-- Replace single-column partial index with composite (variant × recency).
drop index if exists public.dispatch_offers_ux_variant_idx;

create index if not exists idx_dispatch_offers_variant_created
  on public.dispatch_offers (ux_variant, created_at desc)
  where ux_variant is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'dispatch_offers'
      and c.conname = 'ck_dispatch_offers_ux_variant'
  ) then
    alter table public.dispatch_offers
      add constraint ck_dispatch_offers_ux_variant
      check (
        ux_variant is null
        or ux_variant in ('control', 'sound_on', 'high_urgency', 'cta_v2')
      );
  end if;
end $$;
