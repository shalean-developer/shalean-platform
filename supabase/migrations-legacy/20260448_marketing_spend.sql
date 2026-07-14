create table if not exists public.marketing_spend (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('google_ads', 'facebook_ads', 'organic_seo', 'direct')),
  amount numeric not null check (amount >= 0),
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists marketing_spend_date_channel_idx
  on public.marketing_spend (date desc, channel);
