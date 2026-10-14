-- AUDIT-03C-01: immutable cleaner identity for bank payment references.
-- Additive only: no booking, earnings, payout or settlement changes.
begin;
lock table public.cleaners in share row exclusive mode;
create sequence public.cleaner_payment_id_seq minvalue 1 maxvalue 999999 no cycle;
revoke all on sequence public.cleaner_payment_id_seq from public, anon, authenticated, service_role;
alter table public.cleaners add column payment_id text;
create function public.assign_cleaner_payment_id()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.payment_id is distinct from OLD.payment_id then
      raise exception 'Cleaner payment ID is immutable';
    end if;
  else
    if NEW.payment_id is not null then
      raise exception 'Cleaner payment ID must be allocated by the database';
    end if;
    NEW.payment_id := 'SHL-CL-' || lpad(nextval('public.cleaner_payment_id_seq')::text, 6, '0');
  end if;
  return NEW;
end;
$$;
revoke all on function public.assign_cleaner_payment_id() from public, anon, authenticated, service_role;
-- Stable initial allocation includes inactive cleaners; IDs are never reused.
do $$
declare r record;
begin
  for r in select id from public.cleaners order by created_at, id loop
    update public.cleaners set payment_id = 'SHL-CL-' || lpad(nextval('public.cleaner_payment_id_seq')::text, 6, '0') where id=r.id;
  end loop;
end $$;
alter table public.cleaners alter column payment_id set not null;
alter table public.cleaners add constraint cleaners_payment_id_format check (payment_id ~ '^SHL-CL-[0-9]{6}$');
alter table public.cleaners add constraint cleaners_payment_id_unique unique (payment_id);
create trigger cleaner_payment_id_identity before insert or update on public.cleaners
for each row execute function public.assign_cleaner_payment_id();
comment on column public.cleaners.payment_id is 'Permanent bank-payment identity; never reuse or change. Not evidence of beneficiary verification or settlement.';
commit;
