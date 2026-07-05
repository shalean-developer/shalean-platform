-- Allow linking `bookings.zoho_invoice_id` without re-validating team payout owner.
-- Zoho backfill/sync only touches this column; team roster checks must not block billing links.

create or replace function public.bookings_trg_ensure_payout_owner_in_team()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'UPDATE' then
    if new.zoho_invoice_id is distinct from old.zoho_invoice_id
       and (to_jsonb(new) - 'zoho_invoice_id' - 'updated_at')
           is not distinct from (to_jsonb(old) - 'zoho_invoice_id' - 'updated_at') then
      return new;
    end if;
  end if;

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
