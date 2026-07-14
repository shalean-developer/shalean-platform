-- Dispatch offer counters: idempotent repair for environments that diverged
-- from `20260437_dispatch_v3_offers_acceptance.sql` and are now missing
-- public.cleaners.total_offers / accepted_offers / acceptance_rate. The runtime
-- RPC `dispatch_cleaner_offer_sent` references those columns and otherwise
-- raises `column "total_offers" does not exist` at every offer creation.
--
-- Safe to re-run: every column add uses `if not exists`, every function uses
-- `create or replace`. Existing CHECK constraints from 20260437 are not
-- duplicated (we only add the column when missing), so no constraint conflict.

alter table public.cleaners
  add column if not exists total_offers integer not null default 0;

alter table public.cleaners
  add column if not exists accepted_offers integer not null default 0;

alter table public.cleaners
  add column if not exists acceptance_rate real not null default 1.0;

-- Backfill acceptance_rate from existing counters (no-op on green-field rows).
update public.cleaners
set acceptance_rate = case
  when total_offers > 0 then least(
    1.0::real,
    greatest(0.0::real, accepted_offers::real / total_offers::real)
  )
  else 1.0::real
end
where acceptance_rate is null
   or (total_offers > 0
       and abs(acceptance_rate - (accepted_offers::real / nullif(total_offers, 0)::real)) > 0.0001);

comment on column public.cleaners.total_offers is
  'Lifetime dispatch offers sent to this cleaner (atomic counter via dispatch_cleaner_offer_sent).';
comment on column public.cleaners.accepted_offers is
  'Lifetime dispatch offers accepted by this cleaner (atomic counter via dispatch_cleaner_offer_accepted).';
comment on column public.cleaners.acceptance_rate is
  'accepted_offers / total_offers; defaults to 1 until first offer.';

-- Recreate the counter RPCs to match the canonical 20260437 definition.
-- `create or replace` is idempotent and does not change the function's
-- signature or behavior on environments that already have it.
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
