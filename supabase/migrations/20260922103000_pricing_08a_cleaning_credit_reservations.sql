-- PRICING-08A: exactly-once Cleaning Credit checkout reservations.
-- GOVERNED / UNAPPLIED in this stage. Do not run against production until separately authorised.

begin;

create table if not exists public.cleaning_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_zar numeric not null check (amount_zar > 0),
  status text not null default 'reserved' check (status in ('reserved','settled','released')),
  reserved_at timestamptz not null default now(),
  settled_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

create index if not exists cleaning_credit_reservations_user_status_idx
  on public.cleaning_credit_reservations(user_id, status);

create or replace function public.reserve_cleaning_credit_for_booking(
  p_user_id uuid,
  p_booking_id uuid,
  p_amount_zar numeric
)
returns table (ok boolean, reservation_id uuid, amount_zar numeric, balance_after_zar numeric, status text, error_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.cleaning_credit_reservations%rowtype;
  v_current numeric;
  v_amount numeric := round(greatest(coalesce(p_amount_zar,0),0)::numeric,2);
  v_after numeric;
begin
  if p_user_id is null or p_booking_id is null or v_amount <= 0 then
    return query select false,null::uuid,0::numeric,0::numeric,null::text,'invalid_reservation_request'; return;
  end if;
  select * into v_existing from public.cleaning_credit_reservations where booking_id=p_booking_id for update;
  if found then
    if v_existing.user_id <> p_user_id then
      return query select false,v_existing.id,v_existing.amount_zar,0::numeric,v_existing.status,'booking_reservation_owner_mismatch'; return;
    end if;
    select coalesce(credit_balance_zar,0) into v_current from public.user_profiles where id=p_user_id;
    return query select true,v_existing.id,v_existing.amount_zar,coalesce(v_current,0),v_existing.status,null::text; return;
  end if;
  select coalesce(credit_balance_zar,0) into v_current from public.user_profiles where id=p_user_id for update;
  if not found then return query select false,null::uuid,0::numeric,0::numeric,null::text,'user_not_found'; return; end if;
  if v_current < v_amount then return query select false,null::uuid,0::numeric,v_current,null::text,'insufficient_credit'; return; end if;
  v_after := round((v_current-v_amount)*100)/100;
  update public.user_profiles set credit_balance_zar=v_after where id=p_user_id;
  insert into public.cleaning_credit_reservations(booking_id,user_id,amount_zar)
    values(p_booking_id,p_user_id,v_amount) returning id into reservation_id;
  return query select true,reservation_id,v_amount,v_after,'reserved'::text,null::text;
end; $$;

create or replace function public.settle_cleaning_credit_for_booking(p_booking_id uuid)
returns table (ok boolean, reservation_id uuid, status text, error_message text)
language plpgsql security definer set search_path=public
as $$
declare v public.cleaning_credit_reservations%rowtype;
begin
  select * into v from public.cleaning_credit_reservations where booking_id=p_booking_id for update;
  if not found then return query select false,null::uuid,null::text,'reservation_not_found'; return; end if;
  if v.status='settled' then return query select true,v.id,v.status,null::text; return; end if;
  if v.status='released' then return query select false,v.id,v.status,'reservation_already_released'; return; end if;
  insert into public.cleaning_credit_transactions(user_id,amount_zar,balance_after_zar,type,booking_id,note,created_by)
    select v.user_id,-v.amount_zar,coalesce(p.credit_balance_zar,0),'spend',v.booking_id,
      'Settled Cleaning Credit reservation','checkout_reservation'
    from public.user_profiles p where p.id=v.user_id;
  update public.cleaning_credit_reservations set status='settled',settled_at=now(),updated_at=now() where id=v.id;
  return query select true,v.id,'settled'::text,null::text;
end; $$;

create or replace function public.release_cleaning_credit_for_booking(p_booking_id uuid)
returns table (ok boolean, reservation_id uuid, status text, error_message text)
language plpgsql security definer set search_path=public
as $$
declare v public.cleaning_credit_reservations%rowtype; v_after numeric;
begin
  select * into v from public.cleaning_credit_reservations where booking_id=p_booking_id for update;
  if not found then return query select false,null::uuid,null::text,'reservation_not_found'; return; end if;
  if v.status='released' then return query select true,v.id,v.status,null::text; return; end if;
  if v.status='settled' then return query select false,v.id,v.status,'reservation_already_settled'; return; end if;
  select coalesce(credit_balance_zar,0) into v_after from public.user_profiles where id=v.user_id for update;
  v_after := round((v_after+v.amount_zar)*100)/100;
  update public.user_profiles set credit_balance_zar=v_after where id=v.user_id;
  update public.cleaning_credit_reservations set status='released',released_at=now(),updated_at=now() where id=v.id;
  return query select true,v.id,'released'::text,null::text;
end; $$;

revoke all on public.cleaning_credit_reservations from anon, authenticated;
revoke all on function public.reserve_cleaning_credit_for_booking(uuid,uuid,numeric) from public, anon, authenticated;
revoke all on function public.settle_cleaning_credit_for_booking(uuid) from public, anon, authenticated;
revoke all on function public.release_cleaning_credit_for_booking(uuid) from public, anon, authenticated;
grant execute on function public.reserve_cleaning_credit_for_booking(uuid,uuid,numeric) to service_role;
grant execute on function public.settle_cleaning_credit_for_booking(uuid) to service_role;
grant execute on function public.release_cleaning_credit_for_booking(uuid) to service_role;

commit;
