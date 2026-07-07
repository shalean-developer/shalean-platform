-- Allow admin per-visit payout edits before batch approval, and audit them.

-- ---------------------------------------------------------------------------
-- payout_frozen_cents: allow drift only while linked payout batch is open
-- ---------------------------------------------------------------------------
create or replace function public.bookings_trg_payout_frozen_immutable_after_eligible()
returns trigger
language plpgsql
as $fn$
declare
  prev text;
  batch_open boolean;
begin
  if tg_op <> 'update' then
    return new;
  end if;

  prev := lower(coalesce(old.payout_status::text, ''));
  if prev not in ('eligible', 'paid') then
    return new;
  end if;

  if new.payout_frozen_cents is not distinct from old.payout_frozen_cents then
    return new;
  end if;

  batch_open := false;
  if new.payout_id is not null then
    select exists (
      select 1
      from public.cleaner_payouts cp
      where cp.id = new.payout_id
        and cp.status in ('pending', 'frozen')
    )
    into batch_open;
  end if;

  if batch_open then
    return new;
  end if;

  raise exception 'payout_frozen_cents is immutable once payout_status is eligible or paid (booking %)', old.id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- admin_earnings_actions — manual per-visit payout adjustment
-- ---------------------------------------------------------------------------
alter table public.admin_earnings_actions
  drop constraint if exists admin_earnings_actions_action_check;

alter table public.admin_earnings_actions
  add constraint admin_earnings_actions_action_check
  check (action in ('fix', 'reset', 'dispute_review', 'dispute_resolve', 'dispute_reject', 'manual_adjust'));

comment on constraint admin_earnings_actions_action_check on public.admin_earnings_actions is
  'Action kinds including manual_adjust for per-visit payout edits before batch approval.';
