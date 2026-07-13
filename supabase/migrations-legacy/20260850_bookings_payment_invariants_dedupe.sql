-- Hardening: payment invariants, off-platform ref uniqueness, notification dedupe for admin mark-paid dispatch wave.

-- ---------------------------------------------------------------------------
-- Backfill off-platform audit fields from legacy paystack_reference patterns
-- ---------------------------------------------------------------------------
update public.bookings
set
  payment_method = case
    when paystack_reference like 'cash\_%' escape '\' then 'cash'::text
    when paystack_reference like 'zoho\_%' escape '\' then 'zoho'::text
    else payment_method
  end,
  payment_reference_external = coalesce(
    nullif(trim(payment_reference_external), ''),
    case
      when paystack_reference like 'zoho\_%' escape '\'
        then nullif(trim(split_part(paystack_reference, 'zoho_', 2)), '')
      else null
    end
  )
where payment_completed_at is not null
  and (
    payment_method is null
    or payment_reference_external is null
  );

-- ---------------------------------------------------------------------------
-- Pre-constraint data fixes (Paystack / monthly rows must satisfy new checks)
-- ---------------------------------------------------------------------------
update public.bookings
set payment_completed_at = coalesce(payment_completed_at, paid_at, created_at)
where payment_status = 'success'
  and payment_completed_at is null;

update public.bookings b
set
  amount_paid_cents = v.cents,
  total_paid_cents = v.cents
from (
  select
    id,
    greatest(
      1,
      coalesce(
        nullif(amount_paid_cents, 0),
        nullif(total_paid_cents, 0),
        case
          when total_paid_zar is not null and total_paid_zar::numeric > 0
            then round(total_paid_zar::numeric * 100)::integer
          else null
        end,
        1
      )
    ) as cents
  from public.bookings
  where payment_status = 'success'
    and (amount_paid_cents is null or amount_paid_cents <= 0)
) v
where b.id = v.id;

update public.bookings
set status = case
    when cleaner_id is not null or selected_cleaner_id is not null then 'assigned'::text
    else 'pending'::text
  end,
  dispatch_status = case
    when cleaner_id is not null or selected_cleaner_id is not null then 'assigned'::text
    else 'searching'::text
  end
where payment_status = 'success'
  and status = 'pending_payment';

-- ---------------------------------------------------------------------------
-- Dedupe (payment_method, external ref) before unique index
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by payment_method, lower(trim(payment_reference_external))
      order by payment_completed_at nulls last, created_at
    ) as rn
  from public.bookings
  where payment_reference_external is not null
    and trim(payment_reference_external) <> ''
    and payment_method in ('cash', 'zoho')
)
update public.bookings b
set payment_reference_external = left(
  trim(b.payment_reference_external) || '-' || replace(b.id::text, '-', ''),
  500
)
from ranked r
where b.id = r.id
  and r.rn > 1;

-- ---------------------------------------------------------------------------
-- payment_method: rename check constraint to requested name
-- ---------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_payment_method_check;

alter table public.bookings
  drop constraint if exists bookings_payment_method_chk;

alter table public.bookings
  add constraint bookings_payment_method_chk
  check (payment_method is null or payment_method in ('cash', 'zoho'));

-- ---------------------------------------------------------------------------
-- Global invariants when payment_status = success
-- ---------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_paid_requires_timestamp;

alter table public.bookings
  add constraint bookings_paid_requires_timestamp
  check (
    payment_status is distinct from 'success'
    or payment_completed_at is not null
  );

alter table public.bookings drop constraint if exists bookings_paid_requires_amount;

alter table public.bookings
  add constraint bookings_paid_requires_amount
  check (
    payment_status is distinct from 'success'
    or (amount_paid_cents is not null and amount_paid_cents > 0)
  );

alter table public.bookings drop constraint if exists bookings_paid_not_pending_payment;

alter table public.bookings
  add constraint bookings_paid_not_pending_payment
  check (
    not (payment_status = 'success' and status = 'pending_payment')
  );

-- ---------------------------------------------------------------------------
-- Unique off-platform external reference (per method + external ref)
-- ---------------------------------------------------------------------------
create unique index if not exists idx_bookings_external_payment_ref
  on public.bookings (payment_method, payment_reference_external)
  where payment_reference_external is not null
    and trim(payment_reference_external) <> '';

comment on index public.idx_bookings_external_payment_ref is
  'Prevents duplicate use of the same external payment reference per method (Zoho invoice id, etc.).';

-- ---------------------------------------------------------------------------
-- Notification dedupe: one dispatch wave claim per booking for admin mark-paid
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
    'dispatch_admin_mark_paid'
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
    'dispatch_admin_mark_paid'
  );

comment on index public.idx_notification_dedupe is
  'At most one system_logs claim per (source, bookingId, cleaner-or-empty) for outbound notification / dispatch idempotency.';
