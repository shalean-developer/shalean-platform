-- P0-02B: restore deny-by-default EXECUTE for all current public SECURITY DEFINER functions.
--
-- Classification model:
--   * public marketing stats RPCs: anon + authenticated + service_role
--   * authenticated RLS ownership helpers: authenticated + service_role
--   * every other SECURITY DEFINER function: service_role only
--
-- This re-applies the July Phase 1.11A model after later migrations that may
-- have recreated functions and restored PostgreSQL's default PUBLIC EXECUTE.

begin;

do $$
declare
  r record;
  public_names text[] := array[
    'public_review_banner_stats',
    'public_marketing_reviews_for_area'
  ];
  authenticated_names text[] := array[
    'user_owns_booking',
    'user_has_booking_with_cleaner'
  ];
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef is true
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
    execute format('revoke all on function %s from service_role', r.sig);

    if r.proname = any(public_names) then
      execute format('grant execute on function %s to anon', r.sig);
      execute format('grant execute on function %s to authenticated', r.sig);
      execute format('grant execute on function %s to service_role', r.sig);
    elsif r.proname = any(authenticated_names) then
      execute format('grant execute on function %s to authenticated', r.sig);
      execute format('grant execute on function %s to service_role', r.sig);
    else
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

comment on function public.public_review_banner_stats() is
  'P0-02 allowlist: public marketing aggregate; anon/authenticated/service_role EXECUTE permitted.';
comment on function public.public_marketing_reviews_for_area(text, integer) is
  'P0-02 allowlist: public marketing aggregate; anon/authenticated/service_role EXECUTE permitted.';

commit;
