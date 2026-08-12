-- P0-02A: restore least-privilege EXECUTE on high-risk SECURITY DEFINER RPCs.
--
-- Root cause: later CREATE OR REPLACE / CREATE FUNCTION migrations can restore
-- PostgreSQL's default PUBLIC EXECUTE privilege after the July 1.11A lockdown.
-- These functions mutate money, billing, identity, dispatch, cron, or admin state
-- and are intended to be reached through server-side/admin flows only.

begin;

do $$
declare
  r record;
  protected_names text[] := array[
    'admin_billing_switch_finalize',
    'admin_mark_payout_paid',
    'apply_cleaning_credit_transaction',
    'approve_cleaner_change_request',
    'assign_team_and_sync_roster',
    'claim_cleaner_earnings_for_paystack',
    'invoke_nextjs_cron',
    'mark_bookings_paid_for_earnings_disbursement',
    'monthly_invoice_hard_close',
    'purge_stale_pending_payment_bookings',
    'repair_empty_team_booking_rosters',
    'replace_booking_cleaners_admin_atomic',
    'replace_booking_line_items_atomic',
    'resolve_admin_monthly_booking_race',
    'resolve_auth_user_id_by_email',
    'retry_unassigned_jobs',
    'run_dispatch_cycle',
    'sync_booking_cleaners_for_team_booking'
  ];
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef is true
      and p.proname = any(protected_names)
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

comment on function public.invoke_nextjs_cron(text) is
  'P0-02: service-role/privileged DB execution only; never grant anon/authenticated EXECUTE.';

commit;
