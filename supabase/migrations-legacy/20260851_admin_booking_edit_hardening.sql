-- Admin booking edit hardening: optimistic locking, payment_mismatch flag, audit trail,
-- idempotency store, and atomic replacement of booking_line_items.

-- ---------------------------------------------------------------------------
-- bookings.updated_at (optimistic concurrency for admin edits)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists updated_at timestamptz not null default now();

update public.bookings
set updated_at = coalesce(updated_at, created_at, now())
where true;

create or replace function public.touch_bookings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_bookings_touch_updated_at on public.bookings;

create trigger trg_bookings_touch_updated_at
before update on public.bookings
for each row
execute function public.touch_bookings_updated_at();

comment on column public.bookings.updated_at is
  'Row version for optimistic concurrency (admin edit-details and similar).';

-- ---------------------------------------------------------------------------
-- Flag when a paid booking was repriced above collected amount (ops follow-up)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists payment_mismatch boolean not null default false;

comment on column public.bookings.payment_mismatch is
  'True when visit total was raised after payment was recorded — customer may owe a top-up.';

-- ---------------------------------------------------------------------------
-- Audit log for admin repricing / detail edits (full edits; notes-only may skip in app)
-- ---------------------------------------------------------------------------
create table if not exists public.booking_changes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  changed_by uuid not null,
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists booking_changes_booking_id_created_idx
  on public.booking_changes (booking_id, created_at desc);

comment on table public.booking_changes is
  'Immutable before/after snapshots for admin-driven booking mutations (repricing, etc.).';

alter table public.booking_changes enable row level security;

revoke all on public.booking_changes from public;
revoke all on public.booking_changes from authenticated;
grant select, insert, update, delete on public.booking_changes to service_role;

-- ---------------------------------------------------------------------------
-- Idempotency for admin edit-details (double-submit / retries)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_request_dedupe (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  dedupe_key text not null,
  booking_id uuid references public.bookings (id) on delete cascade,
  response jsonb,
  created_at timestamptz not null default now(),
  constraint admin_request_dedupe_scope_key unique (scope, dedupe_key)
);

create index if not exists admin_request_dedupe_created_idx
  on public.admin_request_dedupe (created_at desc);

comment on table public.admin_request_dedupe is
  'Short-lived idempotency claims for admin APIs; response cached on success. Prune old rows via cron if needed.';

alter table public.admin_request_dedupe enable row level security;

revoke all on public.admin_request_dedupe from public;
revoke all on public.admin_request_dedupe from authenticated;
grant select, insert, update, delete on public.admin_request_dedupe to service_role;

-- ---------------------------------------------------------------------------
-- Atomic replace line items (single DB transaction)
-- ---------------------------------------------------------------------------
create or replace function public.replace_booking_line_items_atomic(p_booking_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_expect integer := 0;
begin
  if p_booking_id is null then
    raise exception 'replace_booking_line_items_atomic: p_booking_id required';
  end if;

  if p_rows is not null and jsonb_typeof(p_rows) = 'array' then
    v_expect := jsonb_array_length(p_rows);
  end if;

  delete from public.booking_line_items where booking_id = p_booking_id;

  if v_expect > 0 then
    insert into public.booking_line_items (
      booking_id,
      item_type,
      slug,
      name,
      quantity,
      unit_price_cents,
      total_price_cents,
      pricing_source,
      metadata,
      earns_cleaner,
      cleaner_earnings_cents
    )
    select
      p_booking_id,
      r->>'item_type',
      nullif(trim(r->>'slug'), ''),
      coalesce(r->>'name', ''),
      greatest(1, coalesce((r->>'quantity')::integer, 1)),
      (r->>'unit_price_cents')::integer,
      (r->>'total_price_cents')::integer,
      nullif(trim(r->>'pricing_source'), ''),
      case
        when jsonb_typeof(r->'metadata') = 'object' then r->'metadata'
        else '{}'::jsonb
      end,
      coalesce((r->>'earns_cleaner')::boolean, (r->>'item_type')::text is distinct from 'adjustment'),
      case
        when r ? 'cleaner_earnings_cents' and r->>'cleaner_earnings_cents' is not null and trim(r->>'cleaner_earnings_cents') <> ''
          then (r->>'cleaner_earnings_cents')::integer
        else null
      end
    from jsonb_array_elements(p_rows) as r;
  end if;

  select count(*)::integer into v_count from public.booking_line_items where booking_id = p_booking_id;

  if v_expect > 0 and v_count <> v_expect then
    raise exception 'replace_booking_line_items_atomic: expected % line rows, found %', v_expect, v_count;
  end if;

  return v_count;
end;
$$;

revoke all on function public.replace_booking_line_items_atomic(uuid, jsonb) from public;
revoke all on function public.replace_booking_line_items_atomic(uuid, jsonb) from authenticated;
grant execute on function public.replace_booking_line_items_atomic(uuid, jsonb) to service_role;

comment on function public.replace_booking_line_items_atomic(uuid, jsonb) is
  'Deletes all booking_line_items for a booking and inserts the provided rows in one transaction.';
