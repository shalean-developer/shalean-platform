-- Payout batch convergence: every per-cleaner earning line must identify its exact batch.

alter table public.team_job_member_payouts
  add column if not exists cleaner_payout_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_job_member_payouts_cleaner_payout_id_fkey'
      and conrelid = 'public.team_job_member_payouts'::regclass
  ) then
    alter table public.team_job_member_payouts
      add constraint team_job_member_payouts_cleaner_payout_id_fkey
      foreign key (cleaner_payout_id)
      references public.cleaner_payouts(id)
      on delete set null;
  end if;
end
$$;

create index if not exists team_job_member_payouts_cleaner_payout_id_idx
  on public.team_job_member_payouts (cleaner_payout_id)
  where cleaner_payout_id is not null;

comment on column public.team_job_member_payouts.cleaner_payout_id is
  'Exact monthly cleaner_payouts batch containing this team-member earning line.';

-- Backfill legacy rows deterministically. The active-period unique index guarantees at most
-- one non-cancelled batch for a cleaner and calendar month.
update public.team_job_member_payouts tj
set cleaner_payout_id = cp.id
from public.bookings b, public.cleaner_payouts cp
where b.id = tj.booking_id
  and cp.cleaner_id = tj.cleaner_id
  and b.date::date between cp.period_start and cp.period_end
  and cp.status <> 'cancelled'
  and tj.status = 'batched'
  and tj.cleaner_payout_id is null;

-- Payment completion must close every earning rail, not only bookings.payout_id.
create or replace function public.mark_bookings_paid_for_cleaner_payout(p_payout_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_changed integer := 0;
begin
  if p_payout_id is null then
    return 0;
  end if;

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = coalesce(b.payout_paid_at, now())
  where b.payout_id = p_payout_id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
    );
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  update public.booking_roster_member_payouts rp
  set status = 'paid'
  where rp.cleaner_payout_id = p_payout_id
    and rp.status is distinct from 'paid';
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  update public.team_job_member_payouts tj
  set status = 'paid'
  where tj.cleaner_payout_id = p_payout_id
    and tj.status is distinct from 'paid';
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  return v_count;
end;
$$;

revoke all on function public.mark_bookings_paid_for_cleaner_payout(uuid) from public;
revoke all on function public.mark_bookings_paid_for_cleaner_payout(uuid) from anon;
revoke all on function public.mark_bookings_paid_for_cleaner_payout(uuid) from authenticated;
grant execute on function public.mark_bookings_paid_for_cleaner_payout(uuid) to service_role;

comment on function public.mark_bookings_paid_for_cleaner_payout(uuid) is
  'Service-role-only, idempotent completion of direct, roster-member, and team-member payout lines.';
