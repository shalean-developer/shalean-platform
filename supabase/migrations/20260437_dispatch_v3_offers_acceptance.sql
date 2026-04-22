-- Dispatch v3: soft offers, acceptance stats, RPC bumps

alter table public.cleaners
  add column if not exists acceptance_rate real not null default 1.0
    check (acceptance_rate >= 0 and acceptance_rate <= 1),
  add column if not exists total_offers integer not null default 0 check (total_offers >= 0),
  add column if not exists accepted_offers integer not null default 0 check (accepted_offers >= 0);

update public.cleaners
set acceptance_rate = case
  when total_offers > 0 then least(1.0::real, greatest(0.0::real, accepted_offers::real / total_offers::real))
  else 1.0::real
end
where true;

comment on column public.cleaners.acceptance_rate is 'accepted_offers / total_offers; defaults to 1 until first offer.';

create table if not exists public.dispatch_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired')),
  rank_index smallint not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists dispatch_offers_booking_status_idx
  on public.dispatch_offers (booking_id, status);

create unique index if not exists dispatch_offers_one_pending_per_booking_uidx
  on public.dispatch_offers (booking_id)
  where status = 'pending';

comment on table public.dispatch_offers is 'Marketplace soft-assign: one pending offer per booking; cleaner accepts within expires_at.';

-- Atomic counters (avoid lost updates from concurrent offers)
create or replace function public.dispatch_cleaner_offer_sent(p_cleaner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cleaners
  set
    total_offers = total_offers + 1,
    acceptance_rate = case
      when total_offers + 1 > 0 then
        least(1.0::real, greatest(0.0::real, accepted_offers::real / (total_offers + 1)::real))
      else 1.0::real
    end
  where id = p_cleaner_id;
end;
$$;

create or replace function public.dispatch_cleaner_offer_accepted(p_cleaner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cleaners
  set
    accepted_offers = accepted_offers + 1,
    acceptance_rate = case
      when total_offers > 0 then
        least(1.0::real, greatest(0.0::real, (accepted_offers + 1)::real / total_offers::real))
      else 1.0::real
    end
  where id = p_cleaner_id;
end;
$$;

alter table public.dispatch_offers enable row level security;

drop policy if exists dispatch_offers_cleaner_select on public.dispatch_offers;
create policy dispatch_offers_cleaner_select on public.dispatch_offers
  for select to authenticated
  using (cleaner_id = auth.uid());

drop policy if exists dispatch_offers_cleaner_update_own on public.dispatch_offers;
create policy dispatch_offers_cleaner_update_own on public.dispatch_offers
  for update to authenticated
  using (cleaner_id = auth.uid() and status = 'pending')
  with check (cleaner_id = auth.uid());
