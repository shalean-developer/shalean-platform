-- Native PostgreSQL security checks. Run ONLY against isolated database after applying migration.
begin;
do $$
declare
  rel regclass := to_regclass('public.marketing_email_consent_events');
begin
  if rel is null then raise exception 'marketing consent table missing'; end if;
  if not (select relrowsecurity from pg_class where oid=rel) then
    raise exception 'marketing consent RLS not enabled';
  end if;
  if has_table_privilege('anon','public.marketing_email_consent_events','select')
     or has_table_privilege('anon','public.marketing_email_consent_events','insert')
     or has_table_privilege('authenticated','public.marketing_email_consent_events','select')
     or has_table_privilege('authenticated','public.marketing_email_consent_events','insert')
     or has_table_privilege('authenticated','public.marketing_email_consent_events','update')
     or has_table_privilege('authenticated','public.marketing_email_consent_events','delete') then
     raise exception 'unprivileged role has consent-ledger access';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = rel and tgname='marketing_email_consent_immutable' and not tgisinternal
  ) then raise exception 'immutable ledger trigger missing'; end if;
end $$;
do $
declare
 rel regclass := to_regclass('public.marketing_email_reconciliation_jobs');
begin
 if rel is null then raise exception 'marketing opt-out queue missing'; end if;
 if not (select relrowsecurity from pg_class where oid=rel) then
   raise exception 'marketing reconciliation queue RLS disabled';
 end if;
 if has_table_privilege('anon', 'public.marketing_email_reconciliation_jobs', 'select')
    or has_table_privilege('anon', 'public.marketing_email_reconciliation_jobs', 'insert')
    or has_table_privilege('authenticated', 'public.marketing_email_reconciliation_jobs', 'select')
    or has_table_privilege('authenticated', 'public.marketing_email_reconciliation_jobs', 'insert')
    or has_table_privilege('authenticated', 'public.marketing_email_reconciliation_jobs', 'update') then
   raise exception 'unprivileged role can access provider reconciliation queue';
 end if;
end $$;
rollback;
