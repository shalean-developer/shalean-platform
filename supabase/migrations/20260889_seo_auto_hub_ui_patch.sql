-- Safe SEO hub UI automation (order / emphasis only — no copy changes).

create table if not exists public.seo_auto_hub_ui_patch (
  slug text primary key,
  swap_hero_book_ctas boolean not null default false,
  reason text,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  source text not null default 'optimizer',
  updated_at timestamptz not null default now()
);

create index if not exists seo_auto_hub_ui_patch_updated_idx on public.seo_auto_hub_ui_patch (updated_at desc);

comment on table public.seo_auto_hub_ui_patch is
  'When swap_hero_book_ctas is true, hub renders hero booking CTAs in promoted order with styles swapped (growth optimizer).';

alter table public.seo_auto_hub_ui_patch enable row level security;

create policy "seo_auto_hub_ui_patch_service_role"
  on public.seo_auto_hub_ui_patch for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
