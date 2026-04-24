-- Paginated recovery listing; per-call row cap raised to 500 (caller pages with p_offset).
drop function if exists public.list_bookings_due_user_selected_recovery(integer, integer);

create or replace function public.list_bookings_due_user_selected_recovery(
  p_max_attempts integer,
  p_limit integer,
  p_offset integer default 0
) returns table (
  id uuid,
  selected_cleaner_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.selected_cleaner_id
  from public.bookings b
  where b.status = 'pending'
    and b.cleaner_id is null
    and b.assignment_type = 'user_selected'
    and b.dispatch_attempt_count < p_max_attempts
    and b.dispatch_status in ('offered', 'searching')
    and (b.dispatch_next_recovery_at is null or b.dispatch_next_recovery_at <= now())
    and b.selected_cleaner_id is not null
    and not exists (
      select 1
      from public.dispatch_offers o
      where o.booking_id = b.id
        and o.status = 'pending'
    )
  order by b.dispatch_next_recovery_at nulls first, b.created_at asc
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 40), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.list_bookings_due_user_selected_recovery(integer, integer, integer) is
  'Cron: user-selected recovery candidates; DB now(); limit capped at 500; p_offset for paging (default 0).';

revoke all on function public.list_bookings_due_user_selected_recovery(integer, integer, integer) from public;
grant execute on function public.list_bookings_due_user_selected_recovery(integer, integer, integer) to service_role;
