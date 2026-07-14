-- Customer-facing booking reference (e.g. SHL-BK-000001) for confirmation pages and support.

create sequence if not exists public.bookings_reference_seq start 1;

alter table public.bookings
  add column if not exists booking_reference text;

comment on column public.bookings.booking_reference is
  'Human-readable customer reference (SHL-BK-######), assigned on insert.';

create unique index if not exists bookings_booking_reference_uidx
  on public.bookings (booking_reference)
  where booking_reference is not null;

create or replace function public.assign_booking_reference()
returns trigger
language plpgsql
as $$
begin
  if new.booking_reference is null or btrim(new.booking_reference) = '' then
    new.booking_reference :=
      'SHL-BK-' || lpad(nextval('public.bookings_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_assign_reference on public.bookings;

create trigger bookings_assign_reference
  before insert on public.bookings
  for each row
  execute function public.assign_booking_reference();

-- Backfill existing rows in stable created_at order.
with numbered as (
  select
    id,
    row_number() over (order by created_at nulls last, id) as rn
  from public.bookings
  where booking_reference is null or btrim(booking_reference) = ''
)
update public.bookings b
set booking_reference = 'SHL-BK-' || lpad(n.rn::text, 6, '0')
from numbered n
where b.id = n.id;

select setval(
  'public.bookings_reference_seq',
  greatest(
    coalesce(
      (
        select max(
          nullif(regexp_replace(booking_reference, '^SHL-BK-', ''), '')::bigint
        )
        from public.bookings
        where booking_reference ~ '^SHL-BK-[0-9]+$'
      ),
      0
    ),
    1
  )
);
