-- Marketing email synthetic PostgreSQL 17 fixture/regression.
-- Run ONLY on a disposable isolated database, after candidate migration and security assertions.
begin;
do $marketing$
declare
  u uuid := '00000000-0000-4000-8000-000000000777';
  first_event uuid;
begin
  insert into public.user_profiles(id) values(u);
  insert into public.marketing_email_consent_events(customer_id,email,decision,source,policy_version,evidence_reference)
  values(u,'synthetic@example.test','granted','authenticated_preferences','v1','synthetic-grant')
  returning id into first_event;
  if first_event is null then raise exception 'consent insert missing id'; end if;

  begin
    update public.marketing_email_consent_events set decision='withdrawn' where id=first_event;
    raise exception 'FAIL immutable consent accepted update';
  exception when others then
    if sqlerrm <> 'marketing consent evidence is append-only' then raise; end if;
  end;

  begin
    delete from public.marketing_email_consent_events where id=first_event;
    raise exception 'FAIL immutable consent accepted delete';
  exception when others then
    if sqlerrm <> 'marketing consent evidence is append-only' then raise; end if;
  end;

  insert into public.marketing_email_consent_events(customer_id,email,decision,source,policy_version,evidence_reference)
  values(u,'synthetic@example.test','withdrawn','resend_contact_webhook','v1','synthetic-webhook-1');

  begin
    insert into public.marketing_email_consent_events(customer_id,email,decision,source,policy_version,evidence_reference)
    values(u,'synthetic@example.test','withdrawn','resend_contact_webhook','v1','synthetic-webhook-1');
    raise exception 'FAIL duplicate webhook accepted';
  exception when unique_violation then null;
  end;

  insert into public.marketing_email_reconciliation_jobs(customer_id,email,action)
  values(u,'synthetic@example.test','unsubscribe');

  begin
    insert into public.marketing_email_reconciliation_jobs(customer_id,email,action)
    values(u,'synthetic-other@example.test','subscribe');
    raise exception 'FAIL subscribe queue accepted';
  exception when check_violation then null;
  end;

  if (select count(*) from public.marketing_email_consent_events where customer_id=u) <> 2 then
    raise exception 'consent history integrity mismatch';
  end if;
end $marketing$;
rollback;
-- Proof synthetic fixture writes were rolled back.
select case when
  (select count(*) from public.marketing_email_consent_events)=0
  and (select count(*) from public.marketing_email_reconciliation_jobs)=0
  then 'PASS: isolated native PostgreSQL fixture immutability, replay, unsubscribe-only and rollback'
  else (1/0)::text end as isolated_postgres_evidence;
