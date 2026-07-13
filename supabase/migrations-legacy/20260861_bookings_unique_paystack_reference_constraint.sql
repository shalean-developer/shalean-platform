-- Stable name for uniqueness on paystack_reference (no-op if an equivalent unique index already exists).
do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'bookings'
      and c.conname = 'unique_paystack_reference'
  ) then
    return;
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'bookings'
      and indexdef ilike '%unique%'
      and indexdef ilike '%paystack_reference%'
  ) then
    return;
  end if;

  alter table public.bookings
    add constraint unique_paystack_reference unique (paystack_reference);
end $$;
