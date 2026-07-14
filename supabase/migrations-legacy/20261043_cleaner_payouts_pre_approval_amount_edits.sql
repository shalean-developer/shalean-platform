-- Allow admin payout amount edits on pending/frozen cleaner_payouts before approval
-- or assignment to a disbursement run (visit-level edits recalculate batch totals).

create or replace function public.cleaner_payouts_block_mutate_when_frozen()
returns trigger
language plpgsql
as $$
declare
  old_status text := lower(coalesce(old.status::text, ''));
  new_status text := lower(coalesce(new.status::text, ''));
  pre_approval boolean;
begin
  pre_approval := old.payout_run_id is null
    and old_status in ('pending', 'frozen')
    and new_status in ('pending', 'frozen');

  if pre_approval then
    if new.cleaner_id is distinct from old.cleaner_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
    then
      raise exception 'cleaner_payouts %: cannot change cleaner or period before approval', old.id;
    end if;
    return new;
  end if;

  if old.frozen_at is not null or old.payout_run_id is not null then
    if new.total_amount_cents is distinct from old.total_amount_cents
      or new.cleaner_id is distinct from old.cleaner_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
    then
      raise exception 'cleaner_payouts % is frozen or in a disbursement run: cannot change amount, cleaner, or period', old.id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.cleaner_payouts_block_mutate_when_frozen() is
  'Blocks cleaner/period changes after freeze; allows total_amount_cents edits while status is pending/frozen and not in a disbursement run.';
