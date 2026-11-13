\set ON_ERROR_STOP on
-- Disposable database only: never run this fixture against an existing schema.
create role anon;
create role authenticated;
create role service_role;
create table public.bookings (
 id uuid primary key, cleaner_mode text, is_team_job boolean default false, team_id uuid,
 cleaner_count integer default 1, booking_snapshot jsonb default '{}', status text default 'pending_assignment',
 date date default '2026-11-30', time time default '09:00', duration_minutes integer default 180,
 estimated_duration_minutes integer, payment_status text default 'success', payout_status text default 'pending',
 payout_run_id uuid, payout_paid_at timestamptz, cleaner_line_earnings_finalized_at timestamptz,
 cleaner_id uuid, payout_owner_cleaner_id uuid, team_member_count_snapshot integer,
 dispatch_status text, assignment_type text, cleaner_response_status text, assigned_at timestamptz,
 accepted_at timestamptz, fulfillment_mode text, fulfillment_reason text,
 amount_paid_cents integer default 100000
);
create table public.booking_cleaners (
 id uuid default gen_random_uuid(), booking_id uuid references public.bookings(id), cleaner_id uuid not null,
 role text check(role in ('lead','member')), payout_weight numeric default 1, lead_bonus_cents integer default 0,
 source text, unique(booking_id,cleaner_id)
);
create table public.dispatch_offers (id uuid default gen_random_uuid(),booking_id uuid,status text,responded_at timestamptz);
\ir ../../supabase/migrations/20261007210000_audit_02a01_roster_header_convergence.sql
\ir ../../supabase/migrations/20261113102100_regular_multi_cleaner_roster_assignment.sql
-- The earlier migration contains additional functions unused by these fixtures.
grant select,update on public.bookings,public.dispatch_offers to service_role;
grant select on public.booking_cleaners to service_role;
create function public.test_roster(n integer) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('cleaner_id',('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'role',case when i=1 then 'lead' else 'member' end)) from generate_series(1,n) i;
$$;
create function public.test_expect_error(bid uuid,rows jsonb,pattern text) returns void language plpgsql as $$
 begin
  begin
   perform public.assign_requested_cleaner_roster_atomic(bid,rows);
   raise exception 'expected failure %',pattern;
  exception when others then
   if sqlerrm not like '%'||pattern||'%' then raise; end if;
  end;
 end;
$$;
insert into public.bookings(id,cleaner_count,booking_snapshot) values
 ('10000000-0000-4000-8000-000000000001',1,'{"cleanerCount":1}'),
 ('10000000-0000-4000-8000-000000000002',2,'{"cleanerCount":2,"selectedCleanerIds":["00000000-0000-4000-8000-000000000002"]}'),
 ('10000000-0000-4000-8000-000000000003',2,'{"cleanerCount":3}');
select public.test_expect_error('10000000-0000-4000-8000-000000000001',public.test_roster(1),'multi_cleaner_request_required');
select public.test_expect_error('10000000-0000-4000-8000-000000000002',public.test_roster(1),'complete_requested_roster_required');
set role service_role;
select public.assign_requested_cleaner_roster_atomic('10000000-0000-4000-8000-000000000002',public.test_roster(2));
reset role;
do $$ begin
 if (select count(*) from public.booking_cleaners where booking_id='10000000-0000-4000-8000-000000000002')<>2 then raise exception 'missing roster'; end if;
 if (select status from public.bookings where id='10000000-0000-4000-8000-000000000002')<>'assigned' then raise exception 'not assigned'; end if;
 if (select booking_snapshot->'selectedCleanerIds' from public.bookings where id='10000000-0000-4000-8000-000000000002') is null then raise exception 'preference erased'; end if;
 if (select amount_paid_cents from public.bookings where id='10000000-0000-4000-8000-000000000002')<>100000 then raise exception 'payment changed'; end if;
 if has_function_privilege('anon','public.assign_requested_cleaner_roster_atomic(uuid,jsonb)','execute') or has_function_privilege('authenticated','public.assign_requested_cleaner_roster_atomic(uuid,jsonb)','execute') then raise exception 'public execute'; end if;
end $$;
select public.test_expect_error('10000000-0000-4000-8000-000000000003',public.test_roster(2),'complete_requested_roster_required');
select public.test_expect_error('10000000-0000-4000-8000-000000000003',public.test_roster(3),'cleaner_slot_conflict');
update public.bookings set time='13:00' where id='10000000-0000-4000-8000-000000000003';
select public.assign_requested_cleaner_roster_atomic('10000000-0000-4000-8000-000000000003',public.test_roster(3));
do $$ begin
 if (select count(*) from public.booking_cleaners where booking_id='10000000-0000-4000-8000-000000000003')<>3 then raise exception 'three cleaners not visible'; end if;
 if (select cleaner_count from public.bookings where id='10000000-0000-4000-8000-000000000003')<>3 then raise exception 'request reduced'; end if;
end $$;
-- Terminal, unpaid, formal-team and finalized bookings cannot be staffed by this path.
update public.bookings set status='completed' where id='10000000-0000-4000-8000-000000000003';
select public.test_expect_error('10000000-0000-4000-8000-000000000003',public.test_roster(3),'booking_not_assignable');
update public.bookings set status='pending_assignment',payment_status='pending' where id='10000000-0000-4000-8000-000000000003';
select public.test_expect_error('10000000-0000-4000-8000-000000000003',public.test_roster(3),'payment_required');
update public.bookings set payment_status='success',is_team_job=true where id='10000000-0000-4000-8000-000000000003';
select public.test_expect_error('10000000-0000-4000-8000-000000000003',public.test_roster(3),'formal_team_requires_team_assignment');
update public.bookings set is_team_job=false,cleaner_line_earnings_finalized_at=now() where id='10000000-0000-4000-8000-000000000003';
select public.test_expect_error('10000000-0000-4000-8000-000000000003',public.test_roster(3),'booking_payout_locked');
select 'PASS: full requested roster, immutable preference, cleaner visibility, payment preservation, role restrictions and failure rollback';

-- Active-job emergency member edits preserve lifecycle through the existing roster writer.
update public.bookings set status='in_progress',cleaner_line_earnings_finalized_at=null where id='10000000-0000-4000-8000-000000000003';
select public.replace_booking_cleaners_admin_atomic('10000000-0000-4000-8000-000000000003',public.test_roster(3));
do $$ begin
 if (select status from public.bookings where id='10000000-0000-4000-8000-000000000003')<>'in_progress' then raise exception 'active lifecycle reset'; end if;
end $$;
