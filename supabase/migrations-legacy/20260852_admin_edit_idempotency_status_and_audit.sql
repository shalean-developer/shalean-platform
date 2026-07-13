-- Two-phase idempotency (processing / done / failed), booking_changes.summary,
-- stricter replace_booking_line_items_atomic (at least one row), and dispatch_edit_details dedupe.

-- ---------------------------------------------------------------------------
-- admin_request_dedupe.status lifecycle
-- ---------------------------------------------------------------------------
alter table public.admin_request_dedupe
  add column if not exists status text not null default 'processing';

alter table public.admin_request_dedupe
  drop constraint if exists admin_request_dedupe_status_check;

alter table public.admin_request_dedupe
  add constraint admin_request_dedupe_status_check
  check (status in ('processing', 'done', 'failed'));

comment on column public.admin_request_dedupe.status is
  'processing = claim held; done = response is final success; failed = terminal error payload for audit / reclaim.';

update public.admin_request_dedupe
set status = case when response is not null then 'done' else 'failed' end;

-- ---------------------------------------------------------------------------
-- booking_changes.summary (compact diff for ops)
-- ---------------------------------------------------------------------------
alter table public.booking_changes
  add column if not exists summary jsonb;

comment on column public.booking_changes.summary is
  'Optional compact diff: fields_changed[], delta_cents, etc.';

-- ---------------------------------------------------------------------------
-- replace_booking_line_items_atomic: require at least one line row
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

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    raise exception 'replace_booking_line_items_atomic: at least one line item row is required';
  end if;

  v_expect := jsonb_array_length(p_rows);

  delete from public.booking_line_items where booking_id = p_booking_id;

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

  get diagnostics v_count = row_count;

  if v_count <> v_expect then
    raise exception 'replace_booking_line_items_atomic: expected % line rows, inserted %', v_expect, v_count;
  end if;

  select count(*)::integer into v_count from public.booking_line_items where booking_id = p_booking_id;

  if v_count < 1 then
    raise exception 'replace_booking_line_items_atomic: booking has no line items after insert';
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- system_logs dedupe: admin edit dispatch / side-effect wave (one per booking)
-- ---------------------------------------------------------------------------
drop index if exists public.idx_notification_dedupe;

with ranked as (
  select
    id,
    row_number() over (
      partition by
        source,
        coalesce(context->>'bookingId', ''),
        coalesce(context->>'cleanerId', '')
      order by created_at desc
    ) as rn
  from public.system_logs
  where source in (
    'reminder_2h_sent',
    'assigned_sent',
    'completed_sent',
    'sla_breach_sent',
    'review_prompt_sms_sent',
    'review_prompt_sms_reminder_sent',
    'abandon_checkout_reminder_sent',
    'daily_ops_summary',
    'dispatch_admin_mark_paid',
    'dispatch_edit_details'
  )
)
delete from public.system_logs s
using ranked r
where s.id = r.id
  and r.rn > 1;

create unique index idx_notification_dedupe
  on public.system_logs (
    source,
    (context->>'bookingId'),
    coalesce(context->>'cleanerId', '')
  )
  where source in (
    'reminder_2h_sent',
    'assigned_sent',
    'completed_sent',
    'sla_breach_sent',
    'review_prompt_sms_sent',
    'review_prompt_sms_reminder_sent',
    'abandon_checkout_reminder_sent',
    'daily_ops_summary',
    'dispatch_admin_mark_paid',
    'dispatch_edit_details'
  );

comment on index public.idx_notification_dedupe is
  'At most one system_logs claim per (source, bookingId, cleaner-or-empty) for outbound notification / dispatch idempotency.';
