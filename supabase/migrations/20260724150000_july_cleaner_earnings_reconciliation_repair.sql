-- ============================================================================
-- July 2026 cleaner-earnings reconciliation repair (narrow, idempotent)
-- ----------------------------------------------------------------------------
-- Confirmed defects (production project tchayecuvzssixyxlvfu):
--   1) Lynne Thorpe recurring visits SHL-BK-000412/413/414 have completed_at
--      but status='assigned' → excluded from office earnings (status=completed filter).
--   2) SHL-BK-000359 earnings snapshot / summary attributed to Magaret Jiri while
--      Lucia Chiuta is the authoritative cleaner / payout owner.
--      SHL-BK-000360 has a premature Magaret snapshot before completion.
--   3) SHL-BK-000540 (Lorraine / Tian) is in_progress — NO automatic completion.
--
-- Controls
--   * Forward-only, idempotent WHERE guards.
--   * Does NOT touch payment_status / invoice paid state / payout batches /
--     Paystack transfers / paid ledger rows.
--   * Preserves booking IDs, recurring_id, completed_at timestamps, amounts.
--   * Lorraine booking is explicitly out of scope until Ops proves completion.
--
-- Apply staging first. Production requires explicit GO.
-- ============================================================================

create table if not exists public.july_2026_cleaner_earnings_repair_audit (
  id bigserial primary key,
  phase text not null check (phase in ('before', 'after')),
  section text not null,
  booking_id uuid,
  booking_reference text,
  payload jsonb not null,
  payload_sha256 text not null,
  captured_at timestamptz not null default now()
);

comment on table public.july_2026_cleaner_earnings_repair_audit is
  'Before/after snapshots for 20260724150000 July cleaner earnings reconciliation repair. Read-only audit; not a payout rail.';

-- Skip re-snapshotting before-state if this migration already captured it (idempotent re-run).
do $$
begin
  if exists (
    select 1 from public.july_2026_cleaner_earnings_repair_audit where phase = 'before' limit 1
  ) then
    raise notice 'july_earnings_repair: before-state already captured — skipping insert';
    return;
  end if;

  insert into public.july_2026_cleaner_earnings_repair_audit
    (phase, section, booking_id, booking_reference, payload, payload_sha256)
  select
    'before',
    'booking',
    b.id,
    b.booking_reference,
    to_jsonb(b) - 'booking_snapshot',
    encode(extensions.digest(convert_to((to_jsonb(b) - 'booking_snapshot')::text, 'UTF8'), 'sha256'), 'hex')
  from public.bookings b
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
     or b.booking_reference in ('SHL-BK-000359', 'SHL-BK-000360', 'SHL-BK-000540');

  insert into public.july_2026_cleaner_earnings_repair_audit
    (phase, section, booking_id, booking_reference, payload, payload_sha256)
  select
    'before',
    'snapshot',
    s.booking_id,
    b.booking_reference,
    to_jsonb(s),
    encode(extensions.digest(convert_to(to_jsonb(s)::text, 'UTF8'), 'sha256'), 'hex')
  from public.booking_cleaner_earnings_snapshot s
  join public.bookings b on b.id = s.booking_id
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
     or b.booking_reference in ('SHL-BK-000359', 'SHL-BK-000360', 'SHL-BK-000540');

  insert into public.july_2026_cleaner_earnings_repair_audit
    (phase, section, booking_id, booking_reference, payload, payload_sha256)
  select
    'before',
    'roster',
    r.booking_id,
    b.booking_reference,
    to_jsonb(r),
    encode(extensions.digest(convert_to(to_jsonb(r)::text, 'UTF8'), 'sha256'), 'hex')
  from public.booking_cleaners r
  join public.bookings b on b.id = r.booking_id
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
     or b.booking_reference in ('SHL-BK-000359', 'SHL-BK-000360', 'SHL-BK-000540');

  insert into public.july_2026_cleaner_earnings_repair_audit
    (phase, section, booking_id, booking_reference, payload, payload_sha256)
  select
    'before',
    'roster_payout',
    p.booking_id,
    b.booking_reference,
    to_jsonb(p),
    encode(extensions.digest(convert_to(to_jsonb(p)::text, 'UTF8'), 'sha256'), 'hex')
  from public.booking_roster_member_payouts p
  join public.bookings b on b.id = p.booking_id
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
     or b.booking_reference in ('SHL-BK-000359', 'SHL-BK-000360', 'SHL-BK-000540');

  insert into public.july_2026_cleaner_earnings_repair_audit
    (phase, section, booking_id, booking_reference, payload, payload_sha256)
  select
    'before',
    'cleaner_earnings',
    e.booking_id,
    b.booking_reference,
    to_jsonb(e),
    encode(extensions.digest(convert_to(to_jsonb(e)::text, 'UTF8'), 'sha256'), 'hex')
  from public.cleaner_earnings e
  join public.bookings b on b.id = e.booking_id
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
     or b.booking_reference in ('SHL-BK-000359', 'SHL-BK-000360', 'SHL-BK-000540');
end $$;

-- ---------------------------------------------------------------------------
-- 1) Lynne recurring — restore canonical completed status (keep completed_at)
-- ---------------------------------------------------------------------------
with lynne_candidates as (
  select b.id
  from public.bookings b
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
    and b.recurring_id = 'a053ea81-185e-4434-9851-9619ee79f1a2'::uuid
    and b.completed_at is not null
    and lower(btrim(coalesce(b.status, ''))) = 'assigned'
    and lower(btrim(coalesce(b.payment_status, ''))) = 'pending_monthly'
)
update public.bookings b
set
  status = 'completed',
  cleaner_response_status = 'completed',
  updated_at = now()
from lynne_candidates c
where b.id = c.id
  and lower(btrim(coalesce(b.status, ''))) = 'assigned'
  and b.completed_at is not null;

-- ---------------------------------------------------------------------------
-- 2a) SHL-BK-000359 — Magaret → Lucia snapshot ownership
-- ---------------------------------------------------------------------------
with target as (
  select b.id
  from public.bookings b
  where b.booking_reference = 'SHL-BK-000359'
    and b.cleaner_id = '72642f1a-4745-47e1-9a13-1edbb19b20d0'::uuid -- Lucia
    and coalesce(b.payout_owner_cleaner_id, b.cleaner_id) = '72642f1a-4745-47e1-9a13-1edbb19b20d0'::uuid
    and lower(btrim(coalesce(b.status, ''))) = 'completed'
    and not exists (
      select 1
      from public.booking_cleaners bc
      where bc.booking_id = b.id
        and bc.cleaner_id = '2ba4ac8f-f271-4ce3-9811-58dbca218dc1'::uuid -- Magaret
    )
)
update public.booking_cleaner_earnings_snapshot s
set
  cleaner_id = '72642f1a-4745-47e1-9a13-1edbb19b20d0'::uuid,
  updated_at = now()
from target t
where s.booking_id = t.id
  and s.cleaner_id = '2ba4ac8f-f271-4ce3-9811-58dbca218dc1'::uuid;

with target as (
  select b.id
  from public.bookings b
  where b.booking_reference = 'SHL-BK-000359'
    and b.cleaner_id = '72642f1a-4745-47e1-9a13-1edbb19b20d0'::uuid
    and b.earnings_summary is not null
    and b.earnings_summary::text like '%2ba4ac8f-f271-4ce3-9811-58dbca218dc1%'
)
update public.bookings b
set
  earnings_summary = replace(
    b.earnings_summary::text,
    '2ba4ac8f-f271-4ce3-9811-58dbca218dc1',
    '72642f1a-4745-47e1-9a13-1edbb19b20d0'
  )::jsonb,
  updated_at = now()
from target t
where b.id = t.id
  and b.earnings_summary::text like '%2ba4ac8f-f271-4ce3-9811-58dbca218dc1%';

with target as (
  select b.id
  from public.bookings b
  where b.booking_reference = 'SHL-BK-000359'
    and b.cleaner_id = '72642f1a-4745-47e1-9a13-1edbb19b20d0'::uuid
)
update public.cleaner_earnings e
set cleaner_id = '72642f1a-4745-47e1-9a13-1edbb19b20d0'::uuid
from target t
where e.booking_id = t.id
  and e.cleaner_id = '2ba4ac8f-f271-4ce3-9811-58dbca218dc1'::uuid
  and lower(btrim(coalesce(e.status, ''))) not in ('paid', 'processing');

-- ---------------------------------------------------------------------------
-- 2b) SHL-BK-000360 — remove premature Magaret snapshot (future / incomplete)
-- ---------------------------------------------------------------------------
with target as (
  select b.id
  from public.bookings b
  where b.booking_reference = 'SHL-BK-000360'
    and lower(btrim(coalesce(b.status, ''))) <> 'completed'
    and b.completed_at is null
)
delete from public.booking_cleaner_earnings_snapshot_lines l
using target t
where l.booking_id = t.id;

with target as (
  select b.id
  from public.bookings b
  where b.booking_reference = 'SHL-BK-000360'
    and lower(btrim(coalesce(b.status, ''))) <> 'completed'
    and b.completed_at is null
)
delete from public.booking_cleaner_earnings_snapshot s
using target t
where s.booking_id = t.id
  and s.cleaner_id = '2ba4ac8f-f271-4ce3-9811-58dbca218dc1'::uuid;

with target as (
  select b.id
  from public.bookings b
  where b.booking_reference = 'SHL-BK-000360'
    and lower(btrim(coalesce(b.status, ''))) <> 'completed'
    and b.completed_at is null
    and b.earnings_summary is not null
    and b.earnings_summary::text like '%2ba4ac8f-f271-4ce3-9811-58dbca218dc1%'
    and b.earnings_summary::text not like '%72642f1a-4745-47e1-9a13-1edbb19b20d0%'
)
update public.bookings b
set
  earnings_summary = null,
  updated_at = now()
from target t
where b.id = t.id;

-- ---------------------------------------------------------------------------
-- 3) Lorraine SHL-BK-000540 — NO-OP (requires Ops completion evidence)
-- ---------------------------------------------------------------------------
-- Intentionally empty. Do not invent status=completed or earnings.

-- ---------------------------------------------------------------------------
-- 4) After-state audit + notices
-- ---------------------------------------------------------------------------
do $$
declare
  lynne_left int;
  magaret_snap int;
  lorraine_status text;
  payment_drift int;
begin
  delete from public.july_2026_cleaner_earnings_repair_audit where phase = 'after';

  insert into public.july_2026_cleaner_earnings_repair_audit
    (phase, section, booking_id, booking_reference, payload, payload_sha256)
  select
    'after',
    'booking',
    b.id,
    b.booking_reference,
    to_jsonb(b) - 'booking_snapshot',
    encode(extensions.digest(convert_to((to_jsonb(b) - 'booking_snapshot')::text, 'UTF8'), 'sha256'), 'hex')
  from public.bookings b
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
     or b.booking_reference in ('SHL-BK-000359', 'SHL-BK-000360', 'SHL-BK-000540');

  insert into public.july_2026_cleaner_earnings_repair_audit
    (phase, section, booking_id, booking_reference, payload, payload_sha256)
  select
    'after',
    'snapshot',
    s.booking_id,
    b.booking_reference,
    to_jsonb(s),
    encode(extensions.digest(convert_to(to_jsonb(s)::text, 'UTF8'), 'sha256'), 'hex')
  from public.booking_cleaner_earnings_snapshot s
  join public.bookings b on b.id = s.booking_id
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
     or b.booking_reference in ('SHL-BK-000359', 'SHL-BK-000360', 'SHL-BK-000540');

  select count(*) into lynne_left
  from public.bookings b
  where b.id in (
      '6b580f19-0305-4602-8ce2-ac0dad4c9ac1'::uuid,
      'faf965c6-4916-4598-be14-cf541f22bf70'::uuid,
      'ce575148-a048-41e6-828e-c5354132adf9'::uuid
    )
    and lower(btrim(coalesce(b.status, ''))) = 'assigned'
    and b.completed_at is not null;

  select count(*) into magaret_snap
  from public.booking_cleaner_earnings_snapshot s
  join public.bookings b on b.id = s.booking_id
  where b.booking_reference in ('SHL-BK-000359', 'SHL-BK-000360')
    and s.cleaner_id = '2ba4ac8f-f271-4ce3-9811-58dbca218dc1'::uuid;

  select count(*) into payment_drift
  from public.july_2026_cleaner_earnings_repair_audit a
  join public.july_2026_cleaner_earnings_repair_audit b
    on a.booking_id = b.booking_id
   and a.section = 'booking'
   and b.section = 'booking'
   and a.phase = 'before'
   and b.phase = 'after'
  where coalesce(a.payload->>'payment_status', '') is distinct from coalesce(b.payload->>'payment_status', '')
     or coalesce(a.payload->>'amount_paid_cents', '') is distinct from coalesce(b.payload->>'amount_paid_cents', '')
     or coalesce(a.payload->>'monthly_invoice_id', '') is distinct from coalesce(b.payload->>'monthly_invoice_id', '');

  select b.status into lorraine_status
  from public.bookings b
  where b.booking_reference = 'SHL-BK-000540'
  limit 1;

  raise notice 'july_earnings_repair postcheck lynne_assigned_with_completed_at=% magaret_snap_left=% payment_field_drift=% lorraine_status=%',
    lynne_left, magaret_snap, payment_drift, coalesce(lorraine_status, '(missing)');
end $$;
