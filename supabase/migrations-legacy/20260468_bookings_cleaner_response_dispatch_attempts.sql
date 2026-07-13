-- Cleaner acknowledgement + escalation rounds (real-time dispatch / timeout re-dispatch).

alter table public.bookings
  add column if not exists cleaner_response_status text;

alter table public.bookings
  add column if not exists dispatch_attempts integer not null default 0;

comment on column public.bookings.cleaner_response_status is
  'Ack lifecycle: none | pending | accepted | declined | timeout (DB source of truth; Supabase Realtime pushes changes).';

comment on column public.bookings.dispatch_attempts is
  'Count of auto re-dispatch rounds after ack timeout / escalation (separate from assignment_attempts on cleaner reject).';

-- Backfill: existing assigned rows treated as already acknowledged.
update public.bookings
set cleaner_response_status = 'accepted'
where cleaner_id is not null
  and cleaner_response_status is null;

update public.bookings
set cleaner_response_status = 'none'
where cleaner_id is null
  and cleaner_response_status is null;
