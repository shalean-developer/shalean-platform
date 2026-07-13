-- Cleaner offer UI experiment cell (low-cardinality enum from app); nullable for legacy rows.

alter table public.dispatch_offers
  add column if not exists ux_variant text;

comment on column public.dispatch_offers.ux_variant is
  'A/B UI cell assigned at offer creation (e.g. control, sound_on). Used for analytics and client rendering.';

create index if not exists dispatch_offers_ux_variant_idx
  on public.dispatch_offers (ux_variant)
  where ux_variant is not null;
