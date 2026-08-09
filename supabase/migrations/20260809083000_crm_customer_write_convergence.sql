-- P4 CRM live-write convergence: guarantee canonical crm_customer_id on every supported customer-owned write.

create or replace function public.resolve_crm_customer_for_write(
  p_auth_user_id uuid,
  p_email text,
  p_phone text,
  p_display_name text,
  p_source text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_customer_id uuid;
  v_count integer;
  v_now timestamptz := now();
begin
  -- Auth linkage is authoritative only when it already points at one active CRM customer.
  if p_auth_user_id is not null then
    select id into v_customer_id
    from public.customers
    where auth_user_id = p_auth_user_id and status = 'active'
    limit 1;
  end if;

  -- Email is the strongest contact alias. Fail closed when an alias is ambiguous.
  if v_customer_id is null and v_email is not null then
    select count(distinct customer_id), min(customer_id::text)::uuid
      into v_count, v_customer_id
    from public.customer_identity_aliases
    where identity_type = 'email' and normalized_value = v_email;
    if v_count > 1 then
      return null;
    elsif v_count = 0 then
      v_customer_id := null;
    end if;
  end if;

  -- Phone-only resolution is allowed only when exactly one CRM customer owns the alias.
  if v_customer_id is null and v_phone is not null then
    select count(distinct customer_id), min(customer_id::text)::uuid
      into v_count, v_customer_id
    from public.customer_identity_aliases
    where identity_type = 'phone' and normalized_value = v_phone;
    if v_count > 1 then
      return null;
    elsif v_count = 0 then
      v_customer_id := null;
    end if;
  end if;

  -- A new business customer can be created only when we have at least one usable identity.
  if v_customer_id is null then
    if v_email is null and v_phone is null and p_auth_user_id is null then
      return null;
    end if;

    insert into public.customers(
      auth_user_id, display_name, primary_email, normalized_email,
      primary_phone, normalized_phone, metadata, created_at, updated_at
    ) values (
      p_auth_user_id,
      nullif(trim(coalesce(p_display_name, '')), ''),
      nullif(trim(coalesce(p_email, '')), ''),
      v_email,
      nullif(trim(coalesce(p_phone, '')), ''),
      v_phone,
      jsonb_build_object('created_from', p_source),
      v_now, v_now
    ) returning id into v_customer_id;
  elsif p_auth_user_id is not null then
    update public.customers c
      set auth_user_id = p_auth_user_id,
          updated_at = v_now
    where c.id = v_customer_id
      and c.auth_user_id is null
      and not exists (
        select 1 from public.customers c2
        where c2.auth_user_id = p_auth_user_id
          and c2.status = 'active'
          and c2.id <> v_customer_id
      );
  end if;

  if v_email is not null then
    insert into public.customer_identity_aliases(
      customer_id, identity_type, normalized_value, raw_value, source,
      first_seen_at, last_seen_at
    ) values (
      v_customer_id, 'email', v_email, p_email, p_source, v_now, v_now
    )
    on conflict (customer_id, identity_type, normalized_value)
    do update set raw_value = excluded.raw_value,
                  source = excluded.source,
                  last_seen_at = excluded.last_seen_at;
  end if;

  if v_phone is not null then
    insert into public.customer_identity_aliases(
      customer_id, identity_type, normalized_value, raw_value, source,
      first_seen_at, last_seen_at
    ) values (
      v_customer_id, 'phone', v_phone, p_phone, p_source, v_now, v_now
    )
    on conflict (customer_id, identity_type, normalized_value)
    do update set raw_value = excluded.raw_value,
                  source = excluded.source,
                  last_seen_at = excluded.last_seen_at;
  end if;

  return v_customer_id;
end;
$$;

revoke all on function public.resolve_crm_customer_for_write(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.resolve_crm_customer_for_write(uuid,text,text,text,text) to service_role;

create or replace function public.crm_customer_write_convergence_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc jsonb := to_jsonb(new);
  v_auth uuid;
  v_raw_auth text := nullif(v_doc ->> 'customer_id', '');
  v_email text := v_doc ->> 'customer_email';
  v_phone text := v_doc ->> 'customer_phone';
  v_name text := coalesce(v_doc ->> 'customer_name', v_doc ->> 'display_name');
begin
  if new.crm_customer_id is not null then
    return new;
  end if;

  if v_raw_auth ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_auth := v_raw_auth::uuid;
  end if;

  new.crm_customer_id := public.resolve_crm_customer_for_write(
    v_auth,
    v_email,
    v_phone,
    v_name,
    tg_table_name
  );
  return new;
end;
$$;

revoke all on function public.crm_customer_write_convergence_trigger() from public, anon, authenticated;

-- BEFORE triggers cover every application/API write path, including legacy routes.
drop trigger if exists bookings_crm_customer_convergence on public.bookings;
create trigger bookings_crm_customer_convergence
before insert or update of customer_id, customer_email, customer_phone, customer_name
on public.bookings
for each row execute function public.crm_customer_write_convergence_trigger();

drop trigger if exists monthly_invoices_crm_customer_convergence on public.monthly_invoices;
create trigger monthly_invoices_crm_customer_convergence
before insert or update of customer_id
on public.monthly_invoices
for each row execute function public.crm_customer_write_convergence_trigger();

drop trigger if exists sales_documents_crm_customer_convergence on public.sales_documents;
create trigger sales_documents_crm_customer_convergence
before insert or update of customer_id, customer_email, customer_phone, customer_name
on public.sales_documents
for each row execute function public.crm_customer_write_convergence_trigger();

drop trigger if exists customer_care_cases_crm_customer_convergence on public.customer_care_cases;
create trigger customer_care_cases_crm_customer_convergence
before insert or update of customer_id, customer_email, customer_phone
on public.customer_care_cases
for each row execute function public.crm_customer_write_convergence_trigger();

comment on function public.resolve_crm_customer_for_write(uuid,text,text,text,text)
is 'Canonical P4 CRM resolver used by database write convergence triggers. Auth/email preferred; ambiguous aliases fail closed.';
