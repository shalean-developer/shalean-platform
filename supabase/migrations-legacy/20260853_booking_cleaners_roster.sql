-- Phase 1: canonical per-booking cleaner roster (booking_cleaners).
-- Backfill from existing team jobs, dual-write from app via RPCs, RLS for cleaner visibility.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.booking_cleaners (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete restrict,
  role text not null check (role in ('lead', 'member')),
  assigned_at timestamptz not null default now(),
  payout_weight numeric(10, 6) not null default 1 check (payout_weight > 0),
  lead_bonus_cents integer not null default 0 check (lead_bonus_cents >= 0),
  source text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (booking_id, cleaner_id)
);

create index if not exists booking_cleaners_booking_id_idx
  on public.booking_cleaners (booking_id);

create index if not exists booking_cleaners_cleaner_id_idx
  on public.booking_cleaners (cleaner_id);

create unique index if not exists booking_cleaners_one_lead_per_booking_uidx
  on public.booking_cleaners (booking_id)
  where role = 'lead';

comment on table public.booking_cleaners is
  'Per-booking assigned cleaners (roster). Team template rows remain in team_members; this is the job snapshot.';

-- ---------------------------------------------------------------------------
-- Backfill: team jobs → roster (idempotent via ON CONFLICT)
-- ---------------------------------------------------------------------------
insert into public.booking_cleaners (
  booking_id,
  cleaner_id,
  role,
  payout_weight,
  lead_bonus_cents,
  source,
  assigned_at
)
select
  b.id,
  tm.cleaner_id,
  case
    when tm.cleaner_id = b.payout_owner_cleaner_id then 'lead'::text
    when b.payout_owner_cleaner_id is null
      and tm.cleaner_id = (
        select tm2.cleaner_id
        from public.team_members tm2
        where tm2.team_id = b.team_id
          and tm2.cleaner_id is not null
        order by tm2.cleaner_id asc
        limit 1
      ) then 'lead'::text
    else 'member'::text
  end,
  1,
  0,
  'backfill',
  now()
from public.bookings b
inner join public.team_members tm
  on tm.team_id = b.team_id
 and tm.cleaner_id is not null
where coalesce(b.is_team_job, false) = true
  and b.team_id is not null
on conflict (booking_id, cleaner_id) do update set
  role = excluded.role,
  payout_weight = excluded.payout_weight,
  lead_bonus_cents = excluded.lead_bonus_cents,
  source = excluded.source;

-- If multiple leads slipped in (should not), keep payout_owner as lead and demote others.
update public.booking_cleaners bc
set role = 'member'
from public.bookings b
where bc.booking_id = b.id
  and coalesce(b.is_team_job, false) = true
  and b.payout_owner_cleaner_id is not null
  and bc.role = 'lead'
  and bc.cleaner_id is distinct from b.payout_owner_cleaner_id;

-- Ensure one lead per backfilled team booking: promote payout_owner if needed
update public.booking_cleaners bc
set role = 'lead'
from public.bookings b
where bc.booking_id = b.id
  and bc.cleaner_id = b.payout_owner_cleaner_id
  and coalesce(b.is_team_job, false) = true
  and b.team_id is not null;

-- ---------------------------------------------------------------------------
-- RPC: rebuild roster from bookings.team_id + team_members (dual-write / repair)
-- ---------------------------------------------------------------------------
create or replace function public.sync_booking_cleaners_for_team_booking(
  p_booking_id uuid,
  p_source text default 'sync'
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b_team uuid;
  b_date date;
  b_lead uuid;
  b_is_team boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_src text;
begin
  if p_booking_id is null then
    raise exception 'sync_booking_cleaners_for_team_booking: p_booking_id required';
  end if;

  select b.team_id,
         b.date::date,
         b.payout_owner_cleaner_id,
         coalesce(b.is_team_job, false)
    into b_team, b_date, b_lead, b_is_team
    from public.bookings b
   where b.id = p_booking_id;

  if not found then
    raise exception 'sync_booking_cleaners_for_team_booking: booking % not found', p_booking_id;
  end if;

  if b_is_team is not true or b_team is null then
    return;
  end if;

  v_src := nullif(trim(coalesce(p_source, '')), '');
  if v_src is null then
    v_src := 'sync';
  end if;

  v_start := (b_date::text || ' 00:00:00+00')::timestamptz;
  v_end := (b_date::text || ' 23:59:59.999+00')::timestamptz;

  delete from public.booking_cleaners where booking_id = p_booking_id;

  insert into public.booking_cleaners (
    booking_id,
    cleaner_id,
    role,
    payout_weight,
    lead_bonus_cents,
    source
  )
  with active as (
    select tm.cleaner_id
    from public.team_members tm
    where tm.team_id = b_team
      and tm.cleaner_id is not null
      and (tm.active_from is null or tm.active_from <= v_end)
      and (tm.active_to is null or tm.active_to >= v_start)
  ),
  effective_lead as (
    select coalesce(
      case
        when exists (select 1 from active a0 where a0.cleaner_id = b_lead) then b_lead
      end,
      (select a1.cleaner_id from active a1 order by a1.cleaner_id asc limit 1)
    ) as cid
  )
  select
    p_booking_id,
    a.cleaner_id,
    case when a.cleaner_id = el.cid then 'lead'::text else 'member'::text end,
    1,
    0,
    v_src
  from active a
  cross join effective_lead el
  where el.cid is not null;
end;
$fn$;

revoke all on function public.sync_booking_cleaners_for_team_booking(uuid, text) from public;
grant execute on function public.sync_booking_cleaners_for_team_booking(uuid, text) to service_role;

comment on function public.sync_booking_cleaners_for_team_booking(uuid, text) is
  'Deletes and repopulates booking_cleaners from team_members for a team job booking (dual-write / repair).';

-- ---------------------------------------------------------------------------
-- RPC: admin replace roster + set payout_owner to lead (transactional)
-- ---------------------------------------------------------------------------
create or replace function public.replace_booking_cleaners_admin_atomic(
  p_booking_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n_total int;
  n_lead int;
  n_distinct int;
  lead_id uuid;
  elem jsonb;
begin
  if p_booking_id is null then
    raise exception 'replace_booking_cleaners_admin_atomic: p_booking_id required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    raise exception 'replace_booking_cleaners_admin_atomic: members must be a non-empty array';
  end if;

  select count(*) from jsonb_array_elements(p_rows) e into n_total;

  select count(*) from jsonb_array_elements(p_rows) e
   where lower(trim(coalesce(e->>'role', ''))) = 'lead' into n_lead;
  if n_lead <> 1 then
    raise exception 'replace_booking_cleaners_admin_atomic: exactly one lead required (got %)', n_lead;
  end if;

  select count(distinct trim(coalesce(e->>'cleaner_id', '')))
    from jsonb_array_elements(p_rows) e into n_distinct;
  if n_distinct <> n_total then
    raise exception 'replace_booking_cleaners_admin_atomic: duplicate cleaner_id';
  end if;

  for elem in select * from jsonb_array_elements(p_rows)
  loop
    if trim(coalesce(elem->>'cleaner_id', '')) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'replace_booking_cleaners_admin_atomic: invalid cleaner_id';
    end if;
    if lower(trim(coalesce(elem->>'role', ''))) not in ('lead', 'member') then
      raise exception 'replace_booking_cleaners_admin_atomic: invalid role %', elem->>'role';
    end if;
  end loop;

  delete from public.booking_cleaners where booking_id = p_booking_id;

  insert into public.booking_cleaners (
    booking_id,
    cleaner_id,
    role,
    payout_weight,
    lead_bonus_cents,
    source
  )
  select
    p_booking_id,
    trim(e->>'cleaner_id')::uuid,
    lower(trim(e->>'role')),
    case
      when (e->>'payout_weight') is null or trim(e->>'payout_weight') = '' then 1::numeric
      else (e->>'payout_weight')::numeric
    end,
    case
      when (e->>'lead_bonus_cents') is null or trim(e->>'lead_bonus_cents') = '' then 0
      else (e->>'lead_bonus_cents')::integer
    end,
    coalesce(nullif(trim(e->>'source'), ''), 'admin')
  from jsonb_array_elements(p_rows) e;

  select bc.cleaner_id into lead_id
    from public.booking_cleaners bc
   where bc.booking_id = p_booking_id
     and bc.role = 'lead'
   limit 1;

  if lead_id is null then
    raise exception 'replace_booking_cleaners_admin_atomic: lead row missing after insert';
  end if;

  update public.bookings b
     set payout_owner_cleaner_id = lead_id
   where b.id = p_booking_id;
end;
$fn$;

revoke all on function public.replace_booking_cleaners_admin_atomic(uuid, jsonb) from public;
revoke all on function public.replace_booking_cleaners_admin_atomic(uuid, jsonb) from authenticated;
grant execute on function public.replace_booking_cleaners_admin_atomic(uuid, jsonb) to service_role;

comment on function public.replace_booking_cleaners_admin_atomic(uuid, jsonb) is
  'Replaces booking_cleaners for a booking and sets bookings.payout_owner_cleaner_id to the lead.';

-- ---------------------------------------------------------------------------
-- Team payout owner: allow lead on booking_cleaners roster (ad-hoc / post-sync)
-- ---------------------------------------------------------------------------
create or replace function public.bookings_trg_ensure_payout_owner_in_team()
returns trigger
language plpgsql
as $fn$
begin
  if new.is_team_job is true
     and new.team_id is not null
     and new.payout_owner_cleaner_id is not null then
    if exists (
      select 1
        from public.team_members tm
       where tm.team_id = new.team_id
         and tm.cleaner_id = new.payout_owner_cleaner_id
    ) or exists (
      select 1
        from public.booking_cleaners bc
       where bc.booking_id = new.id
         and bc.cleaner_id = new.payout_owner_cleaner_id
         and bc.role = 'lead'
    ) then
      return new;
    end if;
    raise exception 'payout_owner_cleaner_id must be lead on booking_cleaners or member of team_members for team_id %', new.team_id;
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- RLS: booking_cleaners
-- ---------------------------------------------------------------------------
alter table public.booking_cleaners enable row level security;

drop policy if exists booking_cleaners_user_select_own on public.booking_cleaners;
create policy booking_cleaners_user_select_own on public.booking_cleaners
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_cleaners.booking_id
        and b.user_id = auth.uid()
    )
  );

drop policy if exists booking_cleaners_cleaner_select_roster on public.booking_cleaners;
create policy booking_cleaners_cleaner_select_roster on public.booking_cleaners
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = booking_cleaners.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- Writes via service_role / API only (no direct client insert policy)

-- ---------------------------------------------------------------------------
-- RLS: bookings — cleaners see assigned job if on roster
-- ---------------------------------------------------------------------------
drop policy if exists bookings_cleaner_select_assigned on public.bookings;
create policy bookings_cleaner_select_assigned on public.bookings
  for select to authenticated
  using (
    (
      cleaner_id is not null
      and exists (
        select 1 from public.cleaners c
        where c.id = bookings.cleaner_id
          and (c.auth_user_id = auth.uid() or c.id = auth.uid())
      )
    )
    or (
      payout_owner_cleaner_id is not null
      and exists (
        select 1 from public.cleaners c
        where c.id = bookings.payout_owner_cleaner_id
          and (c.auth_user_id = auth.uid() or c.id = auth.uid())
      )
    )
    or exists (
      select 1
        from public.booking_cleaners bc
        inner join public.cleaners c on c.id = bc.cleaner_id
       where bc.booking_id = bookings.id
         and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: booking_line_items — roster cleaners can read lines
-- ---------------------------------------------------------------------------
drop policy if exists booking_line_items_cleaner_select_assigned on public.booking_line_items;
create policy booking_line_items_cleaner_select_assigned on public.booking_line_items
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_line_items.booking_id
        and (
          (
            b.cleaner_id is not null
            and exists (
              select 1 from public.cleaners c
              where c.id = b.cleaner_id
                and (c.auth_user_id = auth.uid() or c.id = auth.uid())
            )
          )
          or (
            b.payout_owner_cleaner_id is not null
            and exists (
              select 1 from public.cleaners c
              where c.id = b.payout_owner_cleaner_id
                and (c.auth_user_id = auth.uid() or c.id = auth.uid())
            )
          )
          or exists (
            select 1
              from public.booking_cleaners bc
              inner join public.cleaners c on c.id = bc.cleaner_id
             where bc.booking_id = b.id
               and (c.auth_user_id = auth.uid() or c.id = auth.uid())
          )
        )
    )
  );
