-- SUPA-MIG-08A — additive production schema convergence
-- Base: integration/shalean-release @ 4f0b73092ad7f894a0441eb5757c13f4736eba5a
--
-- Purpose:
--   * preserve production-only bookings.extra_quantities
--   * restore schema objects required by the current release runtime
--   * reapply previously approved database security hardening
--
-- Intentionally excluded:
--   * recurring-prepayment tables
--   * Push/Expo notification constraint expansion
--   * pg_cron schedules and cron_http_targets runtime values
--   * historical review-prompt backfill
--   * historical CRM stage/source backfill
--   * migration-history repair / legacy migration ledger import
--
-- Forward-only, additive/idempotent. No production data delete or deployment.
BEGIN;

-- ============================================================================
-- Approved default-privilege hardening
-- ============================================================================
-- Phase 1.11C — Stop dump-pattern default privileges for future objects
-- Audit: F-SEC-005 / default privilege amplifier
--
-- Baseline ALTER DEFAULT PRIVILEGES granted ALL on TABLES/SEQUENCES/FUNCTIONS
-- created by role postgres to anon + authenticated. That reopens privilege debt
-- on every new migration object. Close the amplifier; service_role retains ALL.
--
-- Owner/schema: FOR ROLE postgres IN SCHEMA public (migration object owner).
-- TYPES default privileges are out of scope for 1.11C.
-- Does NOT revoke default privileges from service_role or postgres.

-- Why: future tables must not auto-grant ALL (incl. TRUNCATE) to public API roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;

-- Why: keep service_role and postgres able to use newly created objects.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;

COMMENT ON SCHEMA public IS
  'Phase 1.11C: default privileges no longer auto-grant ALL to anon/authenticated. New public objects need explicit GRANT + RLS.';

-- ============================================================================
-- Production-only booking extras preservation
-- ============================================================================
-- Preserve the production-only booking extras quantity map required by the current booking flow.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS extra_quantities jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.bookings.extra_quantities IS
  'Quantity per selected extra service ID, e.g. {"carpet-cleaning": 2}. selected_extras remains the backwards-compatible ID array.';

-- ============================================================================
-- Email campaign recipient safety + idempotency runtime dependency
-- ============================================================================
-- Prevent authentication-only aliases from entering customer email campaigns.
-- These addresses are generated from cleaner phone numbers and are not inboxes.

alter table if exists public.email_campaign_sends
  drop constraint if exists email_campaign_sends_real_recipient_check;

alter table if exists public.email_campaign_sends
  add constraint email_campaign_sends_real_recipient_check
  check (
    recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and lower(recipient_email) not like '%@cleaner.shalean.com'
  ) not valid;

-- Existing historical bounce rows may violate the new rule. NOT VALID makes the
-- constraint apply to all new writes immediately without blocking deployment.

-- A database-backed idempotency key prevents two cron/server instances from
-- claiming and sending the same campaign email at the same time.
alter table if exists public.email_campaign_sends
  add column if not exists idempotency_key text;

create unique index if not exists email_campaign_sends_idempotency_key_uidx
  on public.email_campaign_sends (idempotency_key)
  where idempotency_key is not null;

-- ============================================================================
-- R0 fully-covered booking settlement runtime dependency
-- ============================================================================
-- BK-002: Allow R0 (promo/credit fully-covered) settlements with amount_paid_cents = 0
-- only when a linked promo_credit_cover payment_transactions row exists.
-- Does not weaken normal Paystack success (still requires amount_paid_cents > 0).
-- Forward-only: does not edit 20260850_bookings_payment_invariants_dedupe.sql.

-- Cross-row R0 discriminator for zero-cash success (CHECK may call this stable helper).
create or replace function public.booking_zero_cash_success_is_r0(
  p_booking_id uuid,
  p_payment_transaction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_booking_id is not null
    and p_payment_transaction_id is not null
    and exists (
      select 1
      from public.payment_transactions pt
      where pt.id = p_payment_transaction_id
        and pt.booking_id = p_booking_id
        and pt.entity_type = 'booking'
        and pt.entity_id = p_booking_id
        and pt.gateway = 'other'
        and pt.payment_channel = 'promo_credit_cover'
        and pt.gateway_reference = 'r0:' || p_booking_id::text
        and coalesce(pt.amount_cents, 0) = 0
    );
$$;

comment on function public.booking_zero_cash_success_is_r0(uuid, uuid) is
  'True when payment_transaction_id is a zero-amount promo_credit_cover R0 ledger row for the booking.';

revoke all on function public.booking_zero_cash_success_is_r0(uuid, uuid) from public;
grant execute on function public.booking_zero_cash_success_is_r0(uuid, uuid) to service_role;

alter table public.bookings drop constraint if exists bookings_paid_requires_amount;

alter table public.bookings
  add constraint bookings_paid_requires_amount
  check (
    payment_status is distinct from 'success'
    or (amount_paid_cents is not null and amount_paid_cents > 0)
    or (
      coalesce(amount_paid_cents, 0) = 0
      and payment_completed_at is not null
      and payment_transaction_id is not null
      and public.booking_zero_cash_success_is_r0(id, payment_transaction_id)
    )
  );

comment on constraint bookings_paid_requires_amount on public.bookings is
  'Success requires positive collected cash, OR zero cash with payment_completed_at and a linked promo_credit_cover R0 payment_transaction.';

-- Atomic R0 settle: ledger first, then booking success + zero cash + link in one transaction.
create or replace function public.settle_booking_fully_covered(p_booking_id uuid)
returns table (
  ok boolean,
  error_message text,
  payment_transaction_id uuid,
  already_settled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_tx_id uuid;
  v_ref text;
  v_now timestamptz := now();
  v_total numeric;
begin
  if p_booking_id is null then
    return query select false, 'missing_booking_id'::text, null::uuid, false;
    return;
  end if;

  select * into v_row
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return query select false, 'booking_not_found'::text, null::uuid, false;
    return;
  end if;

  v_total := coalesce(v_row.total_price, 0);

  if lower(coalesce(v_row.payment_status, '')) = 'success'
     and v_row.payment_transaction_id is not null
     and public.booking_zero_cash_success_is_r0(p_booking_id, v_row.payment_transaction_id) then
    return query select true, null::text, v_row.payment_transaction_id, true;
    return;
  end if;

  if v_total > 0 then
    return query select false, 'not_fully_covered'::text, null::uuid, false;
    return;
  end if;

  if lower(coalesce(v_row.status, '')) not in ('pending_payment', 'pending')
     and lower(coalesce(v_row.payment_status, '')) <> 'success' then
    return query select false, 'invalid_status_for_r0'::text, null::uuid, false;
    return;
  end if;

  v_ref := 'r0:' || p_booking_id::text;

  select pt.id into v_tx_id
  from public.payment_transactions pt
  where pt.gateway = 'other'
    and pt.gateway_reference = v_ref
    and pt.payment_channel = 'promo_credit_cover'
  limit 1;

  if v_tx_id is null then
    insert into public.payment_transactions (
      gateway,
      gateway_reference,
      gateway_transaction_id,
      entity_type,
      entity_id,
      amount_cents,
      currency_code,
      processing_fee_cents,
      processing_fee_vat_cents,
      net_settlement_cents,
      fee_calculation_method,
      settlement_status,
      settlement_date,
      payment_channel,
      booking_id,
      paid_at,
      raw_gateway_payload
    ) values (
      'other',
      v_ref,
      null,
      'booking',
      p_booking_id,
      0,
      'ZAR',
      0,
      0,
      0,
      'manual',
      'settled',
      (v_now at time zone 'UTC')::date,
      'promo_credit_cover',
      p_booking_id,
      v_now,
      jsonb_build_object('reason', 'fully_covered_by_promo_referral_or_credit')
    )
    returning id into v_tx_id;
  end if;

  update public.bookings b
  set
    status = case when lower(coalesce(b.status, '')) = 'pending_payment' then 'pending' else b.status end,
    payment_status = 'success',
    payment_completed_at = coalesce(b.payment_completed_at, v_now),
    billing_type = 'prepaid',
    payment_transaction_id = v_tx_id,
    amount_paid_cents = 0,
    total_paid_cents = 0,
    total_paid_zar = 0
  where b.id = p_booking_id;

  return query select true, null::text, v_tx_id, false;
end;
$$;

comment on function public.settle_booking_fully_covered(uuid) is
  'Atomically settle a fully covered (R0) booking: promo_credit_cover ledger + success with zero collected cash.';

revoke all on function public.settle_booking_fully_covered(uuid) from public;
grant execute on function public.settle_booking_fully_covered(uuid) to service_role;

-- ============================================================================
-- Review prompt completion invariant (no historical backfill)
-- ============================================================================
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
after insert or update of status, completed_at, customer_phone, cleaner_id, is_team_job, team_id on public.bookings
for each row
execute function public.enqueue_review_prompt_on_booking_completion();

-- ============================================================================
-- Sales CRM runtime dependency (no historical backfill)
-- ============================================================================
-- P7: durable sales CRM controls without replacing canonical documents/bookings/payments.
alter table public.sales_documents
  add column if not exists crm_stage text,
  add column if not exists crm_owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists crm_next_follow_up_at timestamptz,
  add column if not exists crm_first_responded_at timestamptz,
  add column if not exists crm_won_at timestamptz,
  add column if not exists crm_lost_at timestamptz,
  add column if not exists crm_lost_reason text,
  add column if not exists lead_source text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text;

alter table public.sales_documents drop constraint if exists sales_documents_crm_stage_check;
alter table public.sales_documents add constraint sales_documents_crm_stage_check
  check (crm_stage is null or crm_stage = any (array['lead','qualified','quote','follow_up','won','lost']));

-- Historical CRM stage/source backfill intentionally omitted by SUPA-MIG-08A.
create index if not exists sales_documents_crm_stage_idx
  on public.sales_documents (crm_stage, created_at desc) where converted_from_id is null;
create index if not exists sales_documents_crm_follow_up_idx
  on public.sales_documents (crm_next_follow_up_at) where crm_next_follow_up_at is not null;
create index if not exists sales_documents_crm_owner_idx
  on public.sales_documents (crm_owner_user_id, crm_next_follow_up_at);

create table if not exists public.sales_opportunity_activities (
  id uuid primary key default gen_random_uuid(),
  sales_document_id uuid not null references public.sales_documents(id) on delete cascade,
  activity_type text not null check (activity_type = any (array['note','call','email','whatsapp','stage_change','follow_up'])),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (body is null or char_length(body) <= 4000)
);

create index if not exists sales_opportunity_activities_document_idx
  on public.sales_opportunity_activities (sales_document_id, created_at desc);

alter table public.sales_opportunity_activities enable row level security;
revoke all on public.sales_opportunity_activities from anon, authenticated;
grant all on public.sales_opportunity_activities to service_role;

comment on table public.sales_opportunity_activities is
  'Auditable CRM activity for the root quote/opportunity; financial records remain canonical elsewhere.';

create or replace function public.set_sales_opportunity_crm(
  p_document_id uuid, p_stage text, p_next_follow_up_at timestamptz,
  p_lost_reason text, p_owner_user_id uuid, p_lead_source text, p_actor_user_id uuid
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_previous_stage text;
begin
  if p_stage is not null and p_stage <> all (array['lead','qualified','quote','follow_up','won','lost']) then
    raise exception 'invalid_stage';
  end if;
  if p_stage = 'lost' and nullif(trim(p_lost_reason), '') is null then raise exception 'lost_reason_required'; end if;

  select crm_stage into v_previous_stage from public.sales_documents
  where id = p_document_id and converted_from_id is null for update;
  if not found then raise exception 'opportunity_not_found'; end if;

  update public.sales_documents set
    crm_stage = coalesce(p_stage, crm_stage),
    crm_next_follow_up_at = p_next_follow_up_at,
    crm_owner_user_id = coalesce(p_owner_user_id, crm_owner_user_id),
    lead_source = coalesce(nullif(trim(p_lead_source), ''), lead_source),
    crm_lost_reason = case when p_stage = 'lost' then trim(p_lost_reason) when p_stage is not null then null else crm_lost_reason end,
    crm_won_at = case when p_stage = 'won' and v_previous_stage is distinct from 'won' then now() when p_stage is not null and p_stage <> 'won' then null else crm_won_at end,
    crm_lost_at = case when p_stage = 'lost' and v_previous_stage is distinct from 'lost' then now() when p_stage is not null and p_stage <> 'lost' then null else crm_lost_at end
  where id = p_document_id;

  if p_stage is not null and p_stage is distinct from v_previous_stage then
    insert into public.sales_opportunity_activities (sales_document_id, activity_type, body, metadata, created_by)
    values (p_document_id, 'stage_change', format('Stage changed from %s to %s', coalesce(v_previous_stage, 'unassigned'), p_stage), jsonb_build_object('from', v_previous_stage, 'to', p_stage), p_actor_user_id);
  end if;
end;
$$;

revoke all on function public.set_sales_opportunity_crm(uuid,text,timestamptz,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.set_sales_opportunity_crm(uuid,text,timestamptz,text,uuid,text,uuid) to service_role;

-- ============================================================================
-- Canonical booking duration synchronization
-- ============================================================================
-- P9 Booking Duration: keep the minute column canonical while synchronising
-- legacy/reporting mirrors. Historical rows remain nullable and can be repaired
-- with the governed repair:missing-booking-duration command.

create or replace function public.sync_booking_duration_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canonical_minutes integer;
begin
  canonical_minutes := case
    when new.duration_minutes is not null and new.duration_minutes >= 30
      then round(new.duration_minutes)::integer
    when new.estimated_duration_minutes is not null and new.estimated_duration_minutes >= 30
      then round(new.estimated_duration_minutes)::integer
    when new.duration_hours is not null and new.duration_hours >= 0.5
      then round(new.duration_hours * 60)::integer
    else null
  end;

  if canonical_minutes is not null then
    new.duration_minutes := canonical_minutes;
    new.estimated_duration_minutes := canonical_minutes;
    -- Match durationHoursFromMinutes(): duration_hours is a one-decimal
    -- reporting mirror while integer minutes remain canonical.
    new.duration_hours := round((canonical_minutes::numeric / 60), 1);
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_sync_duration_columns on public.bookings;
create trigger bookings_sync_duration_columns
before insert or update of duration_minutes, estimated_duration_minutes, duration_hours
on public.bookings
for each row execute function public.sync_booking_duration_columns();

comment on function public.sync_booking_duration_columns() is
  'P9: keeps bookings.duration_minutes canonical and synchronises reporting mirrors without inventing missing durations.';

-- ============================================================================
-- Inventory runtime dependency
-- ============================================================================
-- P9 inventory: auditable stock, booking consumption cost, and equipment custody.

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  item_type text not null check (item_type in ('supply','equipment')),
  unit text not null default 'unit',
  quantity_on_hand numeric(12,2) not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric(12,2) not null default 0 check (reorder_level >= 0),
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_equipment_issues (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  booking_id uuid null references public.bookings(id) on delete set null,
  cleaner_id uuid null references public.cleaners(id) on delete set null,
  team_id uuid null references public.teams(id) on delete set null,
  status text not null default 'issued' check (status in ('issued','returned','lost')),
  issued_at timestamptz not null default now(),
  due_at timestamptz null,
  returned_at timestamptz null,
  condition_out text null,
  condition_in text null,
  notes text null,
  issued_by uuid null references auth.users(id) on delete set null,
  closed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cleaner_id is not null or team_id is not null or booking_id is not null)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('purchase','consume','issue','return','loss','adjustment_in','adjustment_out')),
  quantity_delta numeric(12,2) not null check (quantity_delta <> 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  total_cost_cents integer not null check (total_cost_cents >= 0),
  booking_id uuid null references public.bookings(id) on delete set null,
  equipment_issue_id uuid null references public.inventory_equipment_issues(id) on delete set null,
  cleaner_id uuid null references public.cleaners(id) on delete set null,
  team_id uuid null references public.teams(id) on delete set null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_items_reorder_idx on public.inventory_items(is_active, quantity_on_hand, reorder_level);
create index if not exists inventory_movements_item_created_idx on public.inventory_movements(item_id, created_at desc);
create index if not exists inventory_movements_booking_idx on public.inventory_movements(booking_id) where booking_id is not null;
create index if not exists inventory_equipment_issues_open_idx on public.inventory_equipment_issues(status, due_at) where status = 'issued';

create or replace function public.record_inventory_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_booking_id uuid default null,
  p_cleaner_id uuid default null,
  p_team_id uuid default null,
  p_notes text default null,
  p_actor uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_delta numeric(12,2);
  v_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;
  if p_movement_type not in ('purchase','consume','loss','adjustment_in','adjustment_out') then
    raise exception 'unsupported general movement type';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id and is_active for update;
  if not found then raise exception 'inventory item not found'; end if;
  if p_movement_type = 'consume' and v_item.item_type <> 'supply' then
    raise exception 'only supply items can be consumed on a booking';
  end if;
  v_delta := case when p_movement_type in ('purchase','adjustment_in') then p_quantity else -p_quantity end;
  if v_item.quantity_on_hand + v_delta < 0 then raise exception 'insufficient stock'; end if;
  insert into public.inventory_movements(item_id,movement_type,quantity_delta,unit_cost_cents,total_cost_cents,booking_id,cleaner_id,team_id,notes,created_by)
  values (p_item_id,p_movement_type,v_delta,v_item.unit_cost_cents,round(abs(v_delta) * v_item.unit_cost_cents),p_booking_id,p_cleaner_id,p_team_id,nullif(trim(p_notes),''),p_actor)
  returning id into v_id;
  update public.inventory_items set quantity_on_hand = quantity_on_hand + v_delta, updated_at = now() where id = p_item_id;
  return v_id;
end;
$$;

create or replace function public.issue_inventory_equipment(
  p_item_id uuid, p_quantity numeric, p_booking_id uuid default null,
  p_cleaner_id uuid default null, p_team_id uuid default null,
  p_due_at timestamptz default null, p_condition_out text default null,
  p_notes text default null, p_actor uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_item public.inventory_items%rowtype; v_issue_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;
  if p_booking_id is null and p_cleaner_id is null and p_team_id is null then raise exception 'custodian or booking is required'; end if;
  select * into v_item from public.inventory_items where id = p_item_id and is_active for update;
  if not found or v_item.item_type <> 'equipment' then raise exception 'active equipment item not found'; end if;
  if v_item.quantity_on_hand < p_quantity then raise exception 'insufficient stock'; end if;
  insert into public.inventory_equipment_issues(item_id,quantity,booking_id,cleaner_id,team_id,due_at,condition_out,notes,issued_by)
  values (p_item_id,p_quantity,p_booking_id,p_cleaner_id,p_team_id,p_due_at,nullif(trim(p_condition_out),''),nullif(trim(p_notes),''),p_actor)
  returning id into v_issue_id;
  insert into public.inventory_movements(item_id,movement_type,quantity_delta,unit_cost_cents,total_cost_cents,booking_id,equipment_issue_id,cleaner_id,team_id,notes,created_by)
  values (p_item_id,'issue',-p_quantity,v_item.unit_cost_cents,round(p_quantity * v_item.unit_cost_cents),p_booking_id,v_issue_id,p_cleaner_id,p_team_id,p_notes,p_actor);
  update public.inventory_items set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now() where id = p_item_id;
  return v_issue_id;
end;
$$;

create or replace function public.close_inventory_equipment_issue(
  p_issue_id uuid, p_outcome text, p_condition_in text default null,
  p_notes text default null, p_actor uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_issue public.inventory_equipment_issues%rowtype; v_item public.inventory_items%rowtype; v_movement_id uuid;
begin
  if p_outcome not in ('returned','lost') then raise exception 'outcome must be returned or lost'; end if;
  select * into v_issue from public.inventory_equipment_issues where id = p_issue_id and status = 'issued' for update;
  if not found then raise exception 'open equipment issue not found'; end if;
  select * into v_item from public.inventory_items where id = v_issue.item_id for update;
  update public.inventory_equipment_issues set status=p_outcome, returned_at=case when p_outcome='returned' then now() else null end,
    condition_in=nullif(trim(p_condition_in),''), notes=coalesce(nullif(trim(p_notes),''),notes), closed_by=p_actor, updated_at=now()
  where id=p_issue_id;
  if p_outcome='returned' then
    insert into public.inventory_movements(item_id,movement_type,quantity_delta,unit_cost_cents,total_cost_cents,booking_id,equipment_issue_id,cleaner_id,team_id,notes,created_by)
    values (v_issue.item_id,'return',v_issue.quantity,v_item.unit_cost_cents,round(v_issue.quantity*v_item.unit_cost_cents),v_issue.booking_id,v_issue.id,v_issue.cleaner_id,v_issue.team_id,p_notes,p_actor)
    returning id into v_movement_id;
    update public.inventory_items set quantity_on_hand=quantity_on_hand+v_issue.quantity,updated_at=now() where id=v_issue.item_id;
    return v_movement_id;
  end if;
  -- The original issue already removed the asset from on-hand stock. Marking it
  -- lost closes custody without applying a second stock decrement.
  return p_issue_id;
end;
$$;

create or replace view public.booking_inventory_costs with (security_invoker = true) as
select booking_id, sum(total_cost_cents)::bigint as supply_cost_cents
from public.inventory_movements
where booking_id is not null and movement_type in ('consume','loss')
group by booking_id;

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_equipment_issues enable row level security;
revoke all on table public.inventory_items, public.inventory_movements, public.inventory_equipment_issues from anon, authenticated;
revoke all on function public.record_inventory_movement(uuid,text,numeric,uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.issue_inventory_equipment(uuid,numeric,uuid,uuid,uuid,timestamptz,text,text,uuid) from public, anon, authenticated;
revoke all on function public.close_inventory_equipment_issue(uuid,text,text,text,uuid) from public, anon, authenticated;
grant all on table public.inventory_items, public.inventory_movements, public.inventory_equipment_issues to service_role;
grant select on public.booking_inventory_costs to service_role;
grant execute on function public.record_inventory_movement(uuid,text,numeric,uuid,uuid,uuid,text,uuid) to service_role;
grant execute on function public.issue_inventory_equipment(uuid,numeric,uuid,uuid,uuid,timestamptz,text,text,uuid) to service_role;
grant execute on function public.close_inventory_equipment_issue(uuid,text,text,text,uuid) to service_role;

-- Defense-in-depth for service-only operational views created above. This is explicit so the
-- convergence remains safe even if the target inherited legacy default privileges before this migration.
REVOKE ALL ON TABLE public.booking_inventory_costs FROM anon, authenticated;
GRANT SELECT ON TABLE public.booking_inventory_costs TO service_role;

-- ============================================================================
-- Transport runtime dependency
-- ============================================================================
-- P9 transport: vehicles, drivers, booking-linked routes and auditable costs.

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  registration text not null unique,
  make text not null,
  model text not null,
  year integer null check (year is null or year between 1990 and 2100),
  status text not null default 'active' check (status in ('active','maintenance','inactive')),
  seats integer not null default 4 check (seats > 0),
  odometer_km numeric(12,1) not null default 0 check (odometer_km >= 0),
  service_due_km numeric(12,1) null check (service_due_km is null or service_due_km >= 0),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  cleaner_id uuid null unique references public.cleaners(id) on delete set null,
  licence_number text null,
  licence_expires_at date null,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_runs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete restrict,
  driver_id uuid not null references public.transport_drivers(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  scheduled_at timestamptz not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  origin text not null,
  destination text not null,
  odometer_start_km numeric(12,1) null check (odometer_start_km is null or odometer_start_km >= 0),
  odometer_end_km numeric(12,1) null check (odometer_end_km is null or odometer_end_km >= 0),
  total_km numeric(12,1) null check (total_km is null or total_km >= 0),
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (odometer_end_km is null or odometer_start_km is null or odometer_end_km >= odometer_start_km)
);

create table if not exists public.transport_stops (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.transport_runs(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete set null,
  stop_order integer not null check (stop_order > 0),
  stop_type text not null check (stop_type in ('pickup','dropoff','booking','fuel','other')),
  address text not null,
  planned_at timestamptz null,
  arrived_at timestamptz null,
  departed_at timestamptz null,
  notes text null,
  unique (run_id, stop_order)
);

create table if not exists public.transport_cost_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.transport_runs(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete set null,
  expense_id uuid null references public.expenses(id) on delete set null,
  cost_type text not null check (cost_type in ('fuel','parking','maintenance','toll','other')),
  amount_cents integer not null check (amount_cents > 0),
  occurred_at timestamptz not null default now(),
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists transport_runs_schedule_idx on public.transport_runs(status, scheduled_at);
create index if not exists transport_stops_booking_idx on public.transport_stops(booking_id) where booking_id is not null;
create index if not exists transport_cost_entries_run_idx on public.transport_cost_entries(run_id, occurred_at desc);
create index if not exists fleet_vehicles_service_idx on public.fleet_vehicles(status, service_due_km);

create or replace function public.complete_transport_run(
  p_run_id uuid, p_odometer_end_km numeric, p_actor uuid default null
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_run public.transport_runs%rowtype; v_start numeric(12,1); v_total numeric(12,1);
begin
  select * into v_run from public.transport_runs where id=p_run_id and status in ('planned','in_progress') for update;
  if not found then raise exception 'open transport run not found'; end if;
  select odometer_km into v_start from public.fleet_vehicles where id=v_run.vehicle_id for update;
  v_start := coalesce(v_run.odometer_start_km,v_start);
  if p_odometer_end_km is null or p_odometer_end_km < v_start then raise exception 'end odometer must not be before start'; end if;
  v_total := p_odometer_end_km-v_start;
  update public.transport_runs set status='completed',started_at=coalesce(started_at,scheduled_at),completed_at=now(),odometer_start_km=v_start,odometer_end_km=p_odometer_end_km,total_km=v_total,updated_at=now() where id=p_run_id;
  update public.fleet_vehicles set odometer_km=greatest(odometer_km,p_odometer_end_km),updated_at=now() where id=v_run.vehicle_id;
  return v_total;
end;
$$;

create or replace view public.transport_run_cost_summary with (security_invoker = true) as
select r.id as run_id, r.total_km,
  coalesce(sum(c.amount_cents),0)::bigint as total_cost_cents,
  coalesce(sum(c.amount_cents) filter (where c.cost_type='fuel'),0)::bigint as fuel_cents,
  coalesce(sum(c.amount_cents) filter (where c.cost_type='parking'),0)::bigint as parking_cents,
  coalesce(sum(c.amount_cents) filter (where c.cost_type='maintenance'),0)::bigint as maintenance_cents
from public.transport_runs r left join public.transport_cost_entries c on c.run_id=r.id
group by r.id,r.total_km;

create or replace view public.transport_fleet_summary with (security_invoker = true) as
select
  (select count(*) from public.transport_runs where status in ('planned','in_progress'))::bigint as active_runs,
  coalesce((select sum(total_km) from public.transport_runs where status='completed'),0)::numeric as completed_km,
  coalesce((select sum(amount_cents) from public.transport_cost_entries),0)::bigint as recorded_cost_cents;

alter table public.fleet_vehicles enable row level security;
alter table public.transport_drivers enable row level security;
alter table public.transport_runs enable row level security;
alter table public.transport_stops enable row level security;
alter table public.transport_cost_entries enable row level security;
revoke all on table public.fleet_vehicles,public.transport_drivers,public.transport_runs,public.transport_stops,public.transport_cost_entries from anon,authenticated;
revoke all on function public.complete_transport_run(uuid,numeric,uuid) from public,anon,authenticated;
grant all on table public.fleet_vehicles,public.transport_drivers,public.transport_runs,public.transport_stops,public.transport_cost_entries to service_role;
grant select on public.transport_run_cost_summary to service_role;
grant select on public.transport_fleet_summary to service_role;
grant execute on function public.complete_transport_run(uuid,numeric,uuid) to service_role;

REVOKE ALL ON TABLE public.transport_run_cost_summary FROM anon, authenticated;
REVOKE ALL ON TABLE public.transport_fleet_summary FROM anon, authenticated;
GRANT SELECT ON TABLE public.transport_run_cost_summary TO service_role;
GRANT SELECT ON TABLE public.transport_fleet_summary TO service_role;

-- ============================================================================
-- Cleaner early-finish runtime dependency
-- ============================================================================
create table if not exists public.cleaner_early_finish_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  cleaner_id uuid not null references public.cleaners(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','customer_approved','customer_rejected','admin_approved','cancelled')),
  approval_token uuid not null default gen_random_uuid() unique,
  requested_at timestamptz not null default now(),
  customer_responded_at timestamptz,
  customer_response text,
  approved_at timestamptz,
  approved_by text,
  approval_source text check (approval_source in ('customer','admin','supervisor','manager')),
  quoted_duration_minutes integer,
  elapsed_minutes_at_request integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cleaner_early_finish_requests_booking_idx
  on public.cleaner_early_finish_requests (booking_id, requested_at desc);
create index if not exists cleaner_early_finish_requests_status_idx
  on public.cleaner_early_finish_requests (status, requested_at desc);

alter table public.cleaner_early_finish_requests enable row level security;
revoke all on public.cleaner_early_finish_requests from anon, authenticated;
grant all on public.cleaner_early_finish_requests to service_role;

comment on table public.cleaner_early_finish_requests is
  'Audit trail for cleaner early-finish requests and customer/admin approvals used to bypass the minimum-duration completion gate.';

-- ============================================================================
-- Owner command-centre analytics RPC
-- ============================================================================
-- CR-11E: collapse Owner Command Centre analytics into one bounded rollup row.
-- The function runs with caller privileges; only service_role may execute it.

create or replace function public.owner_command_centre_analytics_rollup(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  total_bookings bigint,
  total_revenue_zar bigint,
  distinct_customers bigint,
  returning_customers bigint,
  service_pairs jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with eligible as (
    select
      b.customer_id,
      b.service,
      b.service_slug,
      case
        when coalesce(b.amount_paid_cents, 0) > 0 then round(b.amount_paid_cents::numeric)
        else round(coalesce(b.total_paid_zar, 0)::numeric * 100)
      end as paid_cents
    from public.bookings b
    where b.payment_status = 'success'
      and b.payment_completed_at is not null
      and b.payment_completed_at >= p_start
      and b.payment_completed_at < p_end
      and lower(btrim(coalesce(b.status, ''))) not in ('cancelled', 'failed', 'payment_expired')
      and b.refunded_at is null
      and lower(coalesce(b.refund_status, '')) not in (
        'refunded',
        'full',
        'partial',
        'chargeback',
        'reversed',
        'failed_after_success'
      )
      and b.monthly_invoice_id is null
      and coalesce(b.is_monthly_billing_booking, false) = false
      and lower(coalesce(b.billing_type, '')) not in ('recurring_invoice', 'monthly_contract')
      and (
        coalesce(b.amount_paid_cents, 0) > 0
        or coalesce(b.total_paid_zar, 0) > 0
      )
  ),
  current_customers as (
    select distinct e.customer_id
    from eligible e
    where e.customer_id is not null
  ),
  prior_customers as (
    select distinct b.customer_id
    from public.bookings b
    where b.payment_status = 'success'
      and b.payment_completed_at is not null
      and b.customer_id is not null
      and b.payment_completed_at < p_start
  ),
  services as (
    select e.service, e.service_slug, count(*)::bigint as count
    from eligible e
    group by e.service, e.service_slug
  ),
  service_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'service', s.service,
          'service_slug', s.service_slug,
          'count', s.count
        )
        order by s.count desc, coalesce(s.service_slug, ''), coalesce(s.service, '')
      ),
      '[]'::jsonb
    ) as value
    from services s
  )
  select
    (select count(*)::bigint from eligible),
    (select coalesce(sum(round(e.paid_cents / 100.0)), 0)::bigint from eligible e),
    (select count(*)::bigint from current_customers),
    (
      select count(*)::bigint
      from current_customers c
      join prior_customers p using (customer_id)
    ),
    sj.value
  from service_json sj;
$$;

revoke all on function public.owner_command_centre_analytics_rollup(timestamptz, timestamptz) from public;
revoke all on function public.owner_command_centre_analytics_rollup(timestamptz, timestamptz) from anon;
revoke all on function public.owner_command_centre_analytics_rollup(timestamptz, timestamptz) from authenticated;
grant execute on function public.owner_command_centre_analytics_rollup(timestamptz, timestamptz) to service_role;

-- ============================================================================
-- Referral completion/retry RPC
-- ============================================================================
-- Qualify output-column names in the idempotent rewarded-referral retry path.
create or replace function public.award_customer_referral_credit(
  p_referral_id uuid,
  p_referred_user_id uuid default null,
  p_booking_id uuid default null,
  p_credit_expires_at timestamptz default null,
  p_note text default null
)
returns table (ok boolean, balance_after_zar numeric, error_message text)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_referral public.referrals%rowtype;
  v_credit record;
  v_existing_balance numeric;
begin
  select * into v_referral
  from public.referrals
  where id = p_referral_id
  for update;

  if not found then
    return query select false, 0::numeric, 'referral_not_found'::text;
    return;
  end if;

  if v_referral.referrer_type <> 'customer' then
    return query select false, 0::numeric, 'invalid_referrer_type'::text;
    return;
  end if;

  if v_referral.status = 'rewarded' then
    select c.balance_after_zar into v_existing_balance
    from public.cleaning_credit_transactions as c
    where c.referral_id = p_referral_id and c.type = 'earn'
    order by c.created_at desc
    limit 1;

    if found then
      return query select true, coalesce(v_existing_balance, 0), null::text;
      return;
    end if;

    return query select false, 0::numeric, 'rewarded_without_credit'::text;
    return;
  end if;

  if v_referral.status <> 'pending' then
    return query select false, 0::numeric, 'referral_not_pending'::text;
    return;
  end if;

  select * into v_credit
  from public.apply_cleaning_credit_transaction(
    p_user_id => v_referral.referrer_id,
    p_amount_zar => greatest(0, round(coalesce(v_referral.reward_amount, 0))),
    p_type => 'earn',
    p_referral_id => v_referral.id,
    p_booking_id => p_booking_id,
    p_note => p_note,
    p_created_by => 'referral_completion'
  );

  if not coalesce(v_credit.ok, false) then
    return query select false, coalesce(v_credit.balance_after_zar, 0),
      coalesce(v_credit.error_message, 'credit_transaction_failed')::text;
    return;
  end if;

  update public.referrals
  set status = 'rewarded',
      completed_at = now(),
      rewarded_at = now(),
      credit_expires_at = p_credit_expires_at,
      referred_user_id = coalesce(p_referred_user_id, referred_user_id)
  where id = v_referral.id and status = 'pending';

  if not found then
    raise exception 'referral_state_changed';
  end if;

  return query select true, v_credit.balance_after_zar, null::text;
end;
$function$;

revoke execute on function public.award_customer_referral_credit(uuid, uuid, uuid, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.award_customer_referral_credit(uuid, uuid, uuid, timestamptz, text)
to service_role;

-- ============================================================================
-- Approved log-retention controls
-- ============================================================================
-- Phase 1.11B — P1: Safe log retention controls (no mass delete on apply)
-- Audit: F-OPS-001 / DEBT-DB-009
--
-- Introduces:
--   * public.data_retention_settings (config only; pruning stays opt-in)
--   * batched prune_notification_logs
--   * batched-capable prune_system_logs (optional p_batch_size; default keeps cron compatible)
--
-- Does NOT schedule notification_logs pruning and does NOT delete historical rows
-- unless an operator/cron explicitly calls the prune RPCs with an approved retention.
-- Recommended notification_logs retention for later approval: 90 days.

CREATE TABLE IF NOT EXISTS public.data_retention_settings (
  table_name text PRIMARY KEY,
  retention_days integer NOT NULL,
  batch_size integer NOT NULL DEFAULT 5000,
  prune_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_retention_settings_days_chk CHECK (retention_days >= 1 AND retention_days <= 3650),
  CONSTRAINT data_retention_settings_batch_chk CHECK (batch_size >= 100 AND batch_size <= 100000)
);

COMMENT ON TABLE public.data_retention_settings IS
  'Phase 1.11B: declared retention policy. prune_enabled=false means operators must not auto-delete until approved.';

ALTER TABLE public.data_retention_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.data_retention_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_retention_settings TO service_role;

INSERT INTO public.data_retention_settings (table_name, retention_days, batch_size, prune_enabled, notes)
VALUES
  (
    'system_logs',
    14,
    10000,
    true,
    'SUPA-MIG-08A preserves the approved production system_logs retention: 14 days, bounded batches.'
  ),
  (
    'notification_logs',
    90,
    2000,
    false,
    'Proposed retention only. Do not enable auto-prune until finance/ops explicitly approve and wire cron.'
  )
ON CONFLICT (table_name) DO NOTHING;

-- Batched notification_logs prune (service_role only after grant lockdown migration).
CREATE OR REPLACE FUNCTION public.prune_notification_logs(
  p_retention_days integer DEFAULT NULL,
  p_batch_size integer DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer;
  v_batch integer;
  v_enabled boolean;
  n bigint := 0;
BEGIN
  SELECT retention_days, batch_size, prune_enabled
  INTO v_days, v_batch, v_enabled
  FROM public.data_retention_settings
  WHERE table_name = 'notification_logs';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'data_retention_settings row missing for notification_logs';
  END IF;

  -- Explicit call args override table defaults, but prune_enabled gate remains
  -- unless caller passes p_retention_days AND we allow override... keep gate:
  IF NOT v_enabled THEN
    RAISE EXCEPTION
      'notification_logs prune_enabled=false; refuse delete until retention approved (set prune_enabled=true)';
  END IF;

  v_days := greatest(1, least(coalesce(p_retention_days, v_days), 3650));
  v_batch := greatest(100, least(coalesce(p_batch_size, v_batch), 100000));

  WITH d AS (
    DELETE FROM public.notification_logs nl
    USING (
      SELECT id
      FROM public.notification_logs
      WHERE created_at < now() - make_interval(days => v_days)
      ORDER BY created_at ASC
      LIMIT v_batch
    ) doomed
    WHERE nl.id = doomed.id
    RETURNING 1
  )
  SELECT count(*) INTO n FROM d;

  RETURN coalesce(n, 0);
END;
$$;

COMMENT ON FUNCTION public.prune_notification_logs(integer, integer) IS
  'Phase 1.11B: batched notification_logs delete. Requires data_retention_settings.prune_enabled=true. Default proposed retention 90d — NOT auto-scheduled.';

REVOKE ALL ON FUNCTION public.prune_notification_logs(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_notification_logs(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.prune_notification_logs(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prune_notification_logs(integer, integer) TO service_role;

-- Upgrade system_logs prune to optional batching (backward compatible: single arg still works).
CREATE OR REPLACE FUNCTION public.prune_system_logs(
  p_retention_days integer DEFAULT 30,
  p_batch_size integer DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  days integer := greatest(1, least(coalesce(p_retention_days, 30), 365));
  v_batch integer;
  n bigint := 0;
BEGIN
  IF p_batch_size IS NULL THEN
    -- Legacy behaviour: delete all matching rows in one statement (existing weekly cron).
    WITH d AS (
      DELETE FROM public.system_logs
      WHERE created_at < now() - make_interval(days => days)
      RETURNING 1
    )
    SELECT count(*) INTO n FROM d;
  ELSE
    v_batch := greatest(100, least(p_batch_size, 100000));
    WITH d AS (
      DELETE FROM public.system_logs sl
      USING (
        SELECT id
        FROM public.system_logs
        WHERE created_at < now() - make_interval(days => days)
        ORDER BY created_at ASC
        LIMIT v_batch
      ) doomed
      WHERE sl.id = doomed.id
      RETURNING 1
    )
    SELECT count(*) INTO n FROM d;
  END IF;

  RETURN coalesce(n, 0);
END;
$$;

COMMENT ON FUNCTION public.prune_system_logs(integer, integer) IS
  'Deletes system_logs older than retention (1–365 days, default 30). Optional p_batch_size enables batched deletes. Returns rows removed.';

REVOKE ALL ON FUNCTION public.prune_system_logs(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_system_logs(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.prune_system_logs(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prune_system_logs(integer, integer) TO service_role;

-- Keep the converged environment on the currently approved production retention policy even when
-- an earlier migration already inserted the legacy 30-day setting.
INSERT INTO public.data_retention_settings (
  table_name, retention_days, batch_size, prune_enabled, notes
)
VALUES (
  'system_logs',
  14,
  10000,
  true,
  'SUPA-MIG-08A preserves the approved production system_logs retention: 14 days, bounded batches.'
)
ON CONFLICT (table_name) DO UPDATE
SET retention_days = EXCLUDED.retention_days,
    batch_size = EXCLUDED.batch_size,
    prune_enabled = EXCLUDED.prune_enabled,
    notes = EXCLUDED.notes,
    updated_at = now();

-- ============================================================================
-- Approved Storage least-privilege policies
-- ============================================================================
-- Phase 1.11A — P0: Storage least-privilege policies for production buckets
-- Audit: F-SEC-003
--
-- App evidence (all Storage I/O via getSupabaseAdmin / service_role):
--   blog-media              public CDN read; admin API upload/remove
--   campaign-media          public CDN read; admin/GBP API upload/remove
--   booking-service-photos  private; cleaner QA API upload; signed URL read
--   expense-receipts        private; finance API upload/remove; signed URL read
-- No browser/mobile .storage.from clients. No upsert:true. No storage.update.
--
-- service_role bypasses RLS. Policies below explicitly deny anon/authenticated
-- Data API access while documenting intended model. Public CDN paths for
-- public buckets remain governed by storage.buckets.public = true.

-- Ensure buckets exist (idempotent; baseline dump omitted storage buckets).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'blog-media',
    'blog-media',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'campaign-media',
    'campaign-media',
    true,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'booking-service-photos',
    'booking-service-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'expense-receipts',
    'expense-receipts',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop any prior policies with these names (idempotent re-apply).
DROP POLICY IF EXISTS "phase111a_deny_anon_auth_blog_media" ON storage.objects;
DROP POLICY IF EXISTS "phase111a_deny_anon_auth_campaign_media" ON storage.objects;
DROP POLICY IF EXISTS "phase111a_deny_anon_auth_booking_service_photos" ON storage.objects;
DROP POLICY IF EXISTS "phase111a_deny_anon_auth_expense_receipts" ON storage.objects;

-- Explicit deny for client roles on each bucket (INSERT/SELECT/UPDATE/DELETE).
-- USING (false) / WITH CHECK (false) = no rows/commands permitted for these roles.

-- Phase 1.11A: anon/authenticated cannot use Storage API for blog-media; uploads via service_role API. Public CDN uses buckets.public.
CREATE POLICY "phase111a_deny_anon_auth_blog_media"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'blog-media' AND false)
  WITH CHECK (bucket_id = 'blog-media' AND false);

-- Phase 1.11A: anon/authenticated cannot use Storage API for campaign-media; uploads via service_role API.
CREATE POLICY "phase111a_deny_anon_auth_campaign_media"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'campaign-media' AND false)
  WITH CHECK (bucket_id = 'campaign-media' AND false);

-- Phase 1.11A: private bucket; cleaner/admin uploads and signed reads via service_role only.
CREATE POLICY "phase111a_deny_anon_auth_booking_service_photos"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'booking-service-photos' AND false)
  WITH CHECK (bucket_id = 'booking-service-photos' AND false);

-- Phase 1.11A: private bucket; finance uploads/downloads via service_role only.
CREATE POLICY "phase111a_deny_anon_auth_expense_receipts"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'expense-receipts' AND false)
  WITH CHECK (bucket_id = 'expense-receipts' AND false);

-- ============================================================================
-- Approved admin-view security_invoker posture
-- ============================================================================
-- Phase 1.11B — P1: Admin referral/economics views → security_invoker
-- Audit: F-SEC-004
--
-- job_offers already uses security_invoker=true in baseline.
-- These 12 admin views previously used default security_definer semantics
-- (bypass underlying RLS if SELECT were ever granted to client roles).
-- Application access is via service_role; invoker mode is defense-in-depth.

ALTER VIEW public.admin_booking_promo_costs SET (security_invoker = true);
ALTER VIEW public.admin_global_monthly_referral_economics SET (security_invoker = true);
ALTER VIEW public.admin_referral_checkout_redemption_summary SET (security_invoker = true);
ALTER VIEW public.admin_referral_reconciliation_queue SET (security_invoker = true);
ALTER VIEW public.admin_referrer_conversion_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_event_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_monthly_profitability_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_profitability_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_quality_signals SET (security_invoker = true);
ALTER VIEW public.admin_referrer_redemption_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_redemption_spike_flags SET (security_invoker = true);
ALTER VIEW public.admin_referrer_reward_rollups SET (security_invoker = true);

-- Ensure client roles cannot SELECT (service_role retains access via existing GRANTs).
REVOKE ALL ON TABLE public.admin_booking_promo_costs FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_global_monthly_referral_economics FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referral_checkout_redemption_summary FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referral_reconciliation_queue FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_conversion_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_event_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_monthly_profitability_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_profitability_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_quality_signals FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_redemption_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_redemption_spike_flags FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_reward_rollups FROM anon, authenticated;

GRANT SELECT ON TABLE public.admin_booking_promo_costs TO service_role;
GRANT SELECT ON TABLE public.admin_global_monthly_referral_economics TO service_role;
GRANT SELECT ON TABLE public.admin_referral_checkout_redemption_summary TO service_role;
GRANT SELECT ON TABLE public.admin_referral_reconciliation_queue TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_conversion_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_event_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_monthly_profitability_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_profitability_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_quality_signals TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_redemption_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_redemption_spike_flags TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_reward_rollups TO service_role;

COMMENT ON VIEW public.admin_booking_promo_costs IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_global_monthly_referral_economics IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referral_checkout_redemption_summary IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referral_reconciliation_queue IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_conversion_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_event_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_monthly_profitability_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_profitability_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_quality_signals IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_redemption_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_redemption_spike_flags IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_reward_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';

-- ============================================================================
-- Approved promotion financial-data access controls
-- ============================================================================
-- MKT-001A / WS5 — Promotion financial-data access control
-- Source audit: docs/audits/marketing/MKT-001-marketing-platform-engineering-audit.md (§6.4, R-02/financials)
--
-- Problem: `promotions` had `GRANT ALL ... TO anon/authenticated` plus the policy
-- `promotions_public_read_active` (SELECT USING status='active'), allowing any
-- browser client (with the public anon key) to run
--   GET /rest/v1/promotions?status=eq.active&select=*
-- and read commercially sensitive columns: budget_zar, budget_spent_zar,
-- revenue_generated_zar, usage_limit_*, *_count, created_by, eligibility JSON.
--
-- App reality (verified): promotions are ONLY read server-side via the
-- service-role client (/api/promotions, /api/account/rewards, campaign landing
-- page). No browser code queries `promotions` directly. Both public APIs already
-- return explicit DTOs without financial fields.
--
-- Remediation:
--   1. Revoke anon/authenticated table grants (defense-in-depth); keep service_role.
--   2. Drop the broad anon public-read policy.
--   3. Provide a safe, column-restricted public projection view for any future
--      client-side need (active promotions, non-sensitive fields only).
--
-- Forward-only, idempotent. Does not modify historical migrations.

-- 1. Remove client-role privilege surface on the base table.
REVOKE ALL ON TABLE public.promotions FROM anon;
REVOKE ALL ON TABLE public.promotions FROM authenticated;
GRANT ALL ON TABLE public.promotions TO service_role;

-- 2. Restrict public reads to active rows. Column grants below prevent access to
--    financial and internal fields even when querying the base relation.
DROP POLICY IF EXISTS promotions_public_read_active ON public.promotions;
CREATE POLICY promotions_public_read_active
  ON public.promotions FOR SELECT TO anon, authenticated
  USING (status = 'active');

GRANT SELECT (
  id, slug, name, description, promotion_type, status, starts_at, ends_at,
  banner_image_url, hero_image_url, logo_url, landing_page_path, promo_code,
  auto_apply, discount_type, discount_value, max_discount_zar,
  min_booking_amount_zar, cta_label, terms_html, display_config,
  qr_code_data_url, content_generated_at, template_key, stackable,
  stack_priority, show_on_homepage, show_on_booking, show_on_pricing,
  show_announcement_bar, show_popup, show_featured_card, show_dashboard_card,
  show_booking_banner, created_at, updated_at
) ON TABLE public.promotions TO anon, authenticated;

-- 3. Safe public projection — non-sensitive campaign fields only, active rows only.
--    security_invoker = true: caller permissions and active-row RLS both apply.
CREATE OR REPLACE VIEW public.public_active_promotions
WITH (security_invoker = true) AS
SELECT
  id,
  slug,
  name,
  description,
  promotion_type,
  status,
  starts_at,
  ends_at,
  banner_image_url,
  hero_image_url,
  logo_url,
  landing_page_path,
  promo_code,
  auto_apply,
  discount_type,
  discount_value,
  max_discount_zar,
  min_booking_amount_zar,
  cta_label,
  terms_html,
  display_config,
  qr_code_data_url,
  content_generated_at,
  template_key,
  stackable,
  stack_priority,
  show_on_homepage,
  show_on_booking,
  show_on_pricing,
  show_announcement_bar,
  show_popup,
  show_featured_card,
  show_dashboard_card,
  show_booking_banner,
  created_at,
  updated_at
FROM public.promotions
WHERE status = 'active';

COMMENT ON VIEW public.public_active_promotions IS
  'MKT-001A: security-invoker public projection of active promotions. Base-table column grants and RLS exclude financial/internal fields and inactive rows.';

REVOKE ALL ON public.public_active_promotions FROM anon;
REVOKE ALL ON public.public_active_promotions FROM authenticated;
GRANT SELECT ON public.public_active_promotions TO anon;
GRANT SELECT ON public.public_active_promotions TO authenticated;

-- ============================================================================
-- Approved SECURITY DEFINER execute lockdown
-- ============================================================================
-- Phase 1.11A — P0: Lock down SECURITY DEFINER EXECUTE privileges
-- Audit: docs/audits/phase-1-11-database-health-audit-2026-07-14.md (F-SEC-001, F-SEC-002)
--
-- Does NOT modify function bodies or search_path.
-- Default: privileged DEFINER RPCs → service_role EXECUTE only.
-- Exceptions (repository evidence):
--   * public_review_banner_stats() — anon via getSupabaseServer() (apps/web/lib/home/reviewBannerStats.ts)
--   * public_marketing_reviews_for_area(text,integer) — anon via getSupabaseServer()
--   * user_owns_booking(uuid), user_has_booking_with_cleaner(uuid) — authenticated RLS helpers
-- invoke_nextjs_cron: service_role only (pg_cron / privileged DB roles execute without anon grant)

-- ---------------------------------------------------------------------------
-- 1) Revoke PUBLIC / anon / authenticated from all public SECURITY DEFINER
--    functions, then grant EXECUTE to service_role.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  keep_names text[] := ARRAY[
    'public_review_banner_stats',
    'public_marketing_reviews_for_area',
    'user_owns_booking',
    'user_has_booking_with_cleaner'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef IS TRUE
      AND NOT (p.proname = ANY (keep_names))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Explicit allowlist for marketing RPCs (anon + authenticated + service_role)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.public_review_banner_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_review_banner_stats() FROM anon;
REVOKE ALL ON FUNCTION public.public_review_banner_stats() FROM authenticated;
REVOKE ALL ON FUNCTION public.public_review_banner_stats() FROM service_role;
GRANT EXECUTE ON FUNCTION public.public_review_banner_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.public_review_banner_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_review_banner_stats() TO service_role;

REVOKE ALL ON FUNCTION public.public_marketing_reviews_for_area(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_marketing_reviews_for_area(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.public_marketing_reviews_for_area(text, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.public_marketing_reviews_for_area(text, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.public_marketing_reviews_for_area(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.public_marketing_reviews_for_area(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_marketing_reviews_for_area(text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) RLS helper functions — authenticated (+ service_role); NOT anon
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.user_owns_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_owns_booking(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_owns_booking(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.user_owns_booking(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.user_owns_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_booking(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.user_has_booking_with_cleaner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_booking_with_cleaner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_has_booking_with_cleaner(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.user_has_booking_with_cleaner(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.user_has_booking_with_cleaner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_booking_with_cleaner(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Belt-and-suspenders: invoke_nextjs_cron must not be anon/authenticated
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.invoke_nextjs_cron(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_nextjs_cron(text) FROM anon;
REVOKE ALL ON FUNCTION public.invoke_nextjs_cron(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_nextjs_cron(text) TO service_role;

COMMENT ON FUNCTION public.invoke_nextjs_cron(text) IS
  'Phase 1.11A: EXECUTE limited to service_role (and superuser/pg_cron owners). Do not grant to anon/authenticated.';

-- ============================================================================
-- Approved service-role-only table grant cleanup
-- ============================================================================
-- Phase 1.11C — Revoke anon/authenticated table grants on service_role-only relations
-- Audit: F-SEC-005 / DEBT-DB-004
--
-- Repository evidence: these tables are only accessed via getSupabaseAdmin() /
-- edge service_role / RPCs. Client roles retained GRANT ALL (incl. TRUNCATE) while
-- RLS often denied access — defense-in-depth revoke removes privilege surface.
--
-- Scope: TABLE privileges only (anon + authenticated). Does NOT revoke from
-- service_role, postgres, or supabase_admin. Does NOT use REVOKE … FROM PUBLIC.
-- Sequences, functions, and types are out of scope here (see …130100 / …130200).
--
-- DOES NOT touch customer/marketing/cleaner relations that have authenticated or
-- public RLS policies used by browser/RSC clients (bookings, blog_*, user_*, etc.).

DO $$
DECLARE
  t text;
  service_only text[] := ARRAY[
    -- Admin idempotency / money control plane
    'admin_api_idempotency',
    'admin_billing_idempotency',
    'admin_booking_create_idempotency',
    'admin_earnings_actions',
    'admin_money_action_proposals',
    'admin_request_dedupe',
    -- Accounting sync
    'accounting_invoice_sync',
    'accounting_sync_records',
    -- AI / ML ops
    'ai_decision_logs',
    'ai_experiment_exposures',
    'ai_feature_store',
    'ai_model_weights',
    -- Observability
    'system_logs',
    'system_metrics',
    -- Cron control plane (DB secrets + leases)
    'cron_http_targets',
    'cron_run_leases',
    'cron_runs',
    -- WhatsApp queue / logs
    'whatsapp_queue',
    'whatsapp_logs',
    'whatsapp_delivery_events',
    'whatsapp_inbound_feedback_dedupe',
    'whatsapp_cleaner_unmatched_intent_log',
    -- Notification audit / runtime
    'notification_logs',
    'notification_alerts',
    'notification_idempotency_claims',
    'notification_runtime_flags',
    -- Payout rails (API/webhook/service_role)
    'payout_audit_events',
    'payout_transfer_outbox',
    'payout_transfers',
    'earnings_disbursement_transfers',
    'cleaner_payout_runs',
    -- Job / conversion / dispatch internals
    'failed_jobs',
    'conversion_deferred_payment_link_emails',
    'conversion_experiment_results',
    'conversion_experiments',
    'dispatch_logs',
    'dispatch_metrics',
    'dispatch_retry_queue',
    'dispatch_offer_exposure_dedupe',
    'dispatch_offer_timeout_metric_emitted',
    'dispatch_experiment_snapshots',
    -- Booking ops queues / audit (not customer browser .from)
    'booking_changes',
    'booking_demand_events',
    'booking_events',
    'booking_lifecycle_jobs',
    'booking_payment_recovery_jobs',
    'booking_roster_member_payouts',
    'booking_service_checklists',
    'booking_service_photos',
    'booking_team_assignments',
    'team_job_member_payouts',
    'team_daily_capacity_usage',
    -- Cleaner ops internals
    'cleaner_applications',
    'cleaner_job_issue_reports',
    'cleaner_job_issue_report_idempotency',
    'cleaner_job_lifecycle_idempotency',
    -- Finance / expense (deny policies + admin API only)
    'business_health_scores',
    'expense_accounts',
    'expense_approval_events',
    'expense_approval_limits',
    'expense_categories',
    'expense_vendors',
    'expenses',
    'recurring_expenses',
    'finance_budget_lines',
    'finance_budgets',
    'finance_chart_of_accounts',
    'finance_notifications',
    'payment_transactions',
    'zoho_integration_settings',
    -- Marketing automation / spend / email campaigns
    'email_campaigns',
    'email_campaign_sends',
    'growth_action_outcomes',
    'growth_customer_touch',
    'lifecycle_email_metrics',
    'lifecycle_email_settings',
    'marketing_automation_rules',
    'marketing_spend',
    'newsletter_subscribers',
    'campaign_assets',
    'campaign_content',
    'campaign_templates',
    -- Pricing / promo config audits (catalog SELECT preserved on pricing_services/extras)
    'pricing_booking_config',
    'pricing_catalog_audit',
    'pricing_changes',
    'pricing_metrics',
    'pricing_rules',
    'pricing_slot_adjustments',
    'pricing_versions',
    'promotion_audit_log',
    'promotion_events',
    'service_earning_caps',
    -- SEO / GSC / social publishing (admin APIs)
    'location_gsc_metrics',
    'location_gsc_queries',
    'location_gsc_sync_meta',
    'seo_auto_hub_ui_patch',
    'seo_auto_title_variant',
    'seo_insights_recommendations',
    'social_accounts',
    'social_publish_history',
    -- Misc ops
    'customer_contact_health',
    'customer_segment',
    'city_configs',
    'cities',
    'monthly_invoice_events',
    'monthly_invoice_paystack_charge_dedup',
    'sales_document_paystack_charge_dedup',
    'payment_link_delivery_events',
    'referral_program_settings',
    'referral_submissions',
    'review_sms_prompt_queue',
    'subscriptions',
    'templates',
    'travel_route_cache',
    'user_behavior',
    'user_events',
    'cleaning_credit_transactions',
    'data_retention_settings'
  ];
BEGIN
  FOREACH t IN ARRAY service_only
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'phase_111c skip missing table: %', t;
      CONTINUE;
    END IF;

    -- Why: eliminate client-role privilege on service_role-only relations (F-SEC-005).
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    -- Why: preserve app server / edge / cron access path (never revoke service_role).
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- ============================================================================
-- Approved dangerous client privilege stripping
-- ============================================================================
-- Phase 1.11C — Strip dangerous privileges still held by anon/authenticated
-- Audit: F-SEC-005
--
-- Client roles historically received GRANT ALL (including TRUNCATE / TRIGGER /
-- REFERENCES / MAINTAIN) on user-facing tables. Application code never needs those
-- for PostgREST clients — only SELECT/INSERT/UPDATE/DELETE used via RLS.
--
-- Preserves DML grants required by authenticated/anon RLS policies and browser/RSC
-- .from() usage (bookings, user_profiles, blog_*, etc.).
--
-- Scope: strip dangerous TABLE privileges for anon/authenticated across public;
-- plus bookings_reference_seq and two WhatsApp queue helper functions.
-- Types remain out of scope. Does NOT revoke from service_role / postgres /
-- supabase_admin. Does NOT use REVOKE … FROM PUBLIC.

-- Why: remove catastrophic capabilities if an RLS policy is ever too broad.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Why: booking reference assignment runs in SECURITY DEFINER / trigger context;
-- clients never need sequence privileges (repo uses service_role or triggers).
REVOKE ALL ON SEQUENCE public.bookings_reference_seq FROM anon;
REVOKE ALL ON SEQUENCE public.bookings_reference_seq FROM authenticated;
GRANT ALL ON SEQUENCE public.bookings_reference_seq TO service_role;

-- Ops RPC helpers that are SECURITY INVOKER (or non-DEFINER) but only called with admin.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_pending_whatsapp_jobs',
        'get_whatsapp_queue_status_metrics'
      )
  LOOP
    -- Why: WhatsApp queue drain is service_role/edge only (queue.ts, whatsapp-worker).
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

COMMIT;