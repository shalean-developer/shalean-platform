-- Canonical payroll owner for team rows (cleaner_id stays null).
alter table public.bookings
  add column if not exists payout_owner_cleaner_id uuid references public.cleaners (id) on delete set null;

comment on column public.bookings.payout_owner_cleaner_id is
  'Cleaner id used for admin payout grouping / mark-paid RPC when cleaner_id is null (team jobs).';

create index if not exists bookings_payout_owner_cleaner_id_idx
  on public.bookings (payout_owner_cleaner_id)
  where payout_owner_cleaner_id is not null;

-- Backfill: solo bookings → owner = assigned cleaner.
update public.bookings b
set payout_owner_cleaner_id = b.cleaner_id
where b.cleaner_id is not null
  and b.payout_owner_cleaner_id is null;

-- Backfill: team jobs → deterministic lead (lexicographically first roster cleaner_id).
update public.bookings b
set payout_owner_cleaner_id = x.lead_id
from (
  select distinct on (b2.id)
    b2.id,
    tm.cleaner_id as lead_id
  from public.bookings b2
  inner join public.team_members tm on tm.team_id = b2.team_id and tm.cleaner_id is not null
  where b2.is_team_job = true
    and b2.cleaner_id is null
    and b2.team_id is not null
  order by b2.id, tm.cleaner_id asc
) x
where b.id = x.id
  and b.payout_owner_cleaner_id is null;

-- Backfill frozen cents to cleaner basis where invoice used customer totals (frozen > display).
update public.bookings b
set payout_frozen_cents = round(b.display_earnings_cents)::integer
where b.payout_status in ('eligible', 'paid')
  and b.display_earnings_cents is not null
  and b.display_earnings_cents > 0
  and (
    b.payout_frozen_cents is null
    or b.payout_frozen_cents > b.display_earnings_cents
  );

update public.bookings b
set payout_frozen_cents = round(b.cleaner_payout_cents)::integer
where b.payout_status in ('eligible', 'paid')
  and (b.display_earnings_cents is null or b.display_earnings_cents <= 0)
  and b.cleaner_payout_cents is not null
  and b.cleaner_payout_cents > 0
  and (
    b.payout_frozen_cents is null
    or b.payout_frozen_cents > b.cleaner_payout_cents
  );

update public.bookings
set payout_frozen_cents = greatest(
  0,
  round(coalesce(display_earnings_cents, cleaner_payout_cents, 0))::integer
)
where payout_status in ('eligible', 'paid')
  and payout_frozen_cents is null;

-- Eligible / paid must carry frozen cleaner cents (nullable only while pending).
alter table public.bookings drop constraint if exists bookings_eligible_paid_require_frozen_cents;
alter table public.bookings
  add constraint bookings_eligible_paid_require_frozen_cents
  check (
    payout_status not in ('eligible', 'paid')
    or payout_frozen_cents is not null
  );

comment on constraint bookings_eligible_paid_require_frozen_cents on public.bookings is
  'eligible/paid bookings must have payout_frozen_cents set (cleaner earnings basis).';

-- RPC: match payroll owner OR assigned solo cleaner.
create or replace function public.admin_mark_payout_paid(p_cleaner_ids uuid[])
returns table(updated_count bigint, payout_run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_count bigint := 0;
begin
  with locked as (
    select b.id
    from public.bookings b
    where b.payout_status = 'eligible'
      and (
        b.cleaner_id = any(p_cleaner_ids)
        or b.payout_owner_cleaner_id = any(p_cleaner_ids)
      )
    for update
  ),
  updated as (
    update public.bookings b
    set
      payout_status = 'paid',
      payout_paid_at = now(),
      payout_run_id = v_run_id
    from locked l
    where b.id = l.id
    returning b.id
  )
  select count(*)::bigint into v_count from updated;

  return query select v_count, v_run_id;
end;
$$;

comment on function public.admin_mark_payout_paid(uuid[]) is
  'Marks eligible bookings paid for given cleaner ids (cleaner_id OR payout_owner_cleaner_id); row locks; shared payout_run_id.';

revoke all on function public.admin_mark_payout_paid(uuid[]) from public;
grant execute on function public.admin_mark_payout_paid(uuid[]) to service_role;
