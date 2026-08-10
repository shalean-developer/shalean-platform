-- Make review prompting a booking-completion invariant instead of relying on
-- application notification paths to remember to enqueue the follow-up.

create or replace function public.enqueue_review_prompt_on_booking_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not (
    new.completed_at is not null
    or lower(coalesce(new.status, '')) = 'completed'
  ) then
    return new;
  end if;

  if lower(coalesce(new.status, '')) in ('cancelled', 'failed', 'payment_expired', 'pending_payment') then
    return new;
  end if;

  if nullif(trim(coalesce(new.customer_phone, '')), '') is null then
    return new;
  end if;

  if not (
    new.cleaner_id is not null
    or (new.is_team_job is true and new.team_id is not null)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.reviews r
    where r.booking_id = new.id
  ) then
    return new;
  end if;

  insert into public.review_sms_prompt_queue (
    booking_id,
    first_due_at,
    reminder_due_at
  ) values (
    new.id,
    now() + make_interval(mins => 30 + floor(random() * 31)::int),
    now() + interval '24 hours'
  )
  on conflict (booking_id) do nothing;

  return new;
end;
$function$;

revoke all on function public.enqueue_review_prompt_on_booking_completion() from public, anon, authenticated;
grant execute on function public.enqueue_review_prompt_on_booking_completion() to service_role;

drop trigger if exists bookings_enqueue_review_prompt_on_completion on public.bookings;
create trigger bookings_enqueue_review_prompt_on_completion
after insert or update of status, completed_at, customer_phone, cleaner_id, team_id on public.bookings
for each row
execute function public.enqueue_review_prompt_on_booking_completion();

-- Do not mass-message historical customers. Seed only recent completed bookings
-- that are still inside a reasonable post-service follow-up window.
insert into public.review_sms_prompt_queue (
  booking_id,
  first_due_at,
  reminder_due_at
)
select
  b.id,
  greatest(now() + interval '10 minutes', coalesce(b.completed_at, b.updated_at, b.created_at) + interval '45 minutes'),
  greatest(now() + interval '24 hours', coalesce(b.completed_at, b.updated_at, b.created_at) + interval '24 hours')
from public.bookings b
where (
    b.completed_at is not null
    or lower(coalesce(b.status, '')) = 'completed'
  )
  and lower(coalesce(b.status, '')) not in ('cancelled', 'failed', 'payment_expired', 'pending_payment')
  and coalesce(b.completed_at, b.updated_at, b.created_at) >= now() - interval '24 hours'
  and nullif(trim(coalesce(b.customer_phone, '')), '') is not null
  and (
    b.cleaner_id is not null
    or (b.is_team_job is true and b.team_id is not null)
  )
  and not exists (
    select 1 from public.reviews r where r.booking_id = b.id
  )
on conflict (booking_id) do nothing;
