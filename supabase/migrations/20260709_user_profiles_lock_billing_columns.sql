-- Customers cannot change billing_model fields via PostgREST; only service_role (admin / jobs).

create or replace function public.user_profiles_prevent_customer_billing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.billing_type is not distinct from old.billing_type
     and new.schedule_type is not distinct from old.schedule_type then
    return new;
  end if;
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if auth.uid() is not distinct from new.id then
    raise exception 'user_profiles_billing_model_locked'
      using hint = 'billing_type and schedule_type can only be changed via admin (service role).';
  end if;
  return new;
end;
$$;

comment on function public.user_profiles_prevent_customer_billing_change is
  'Blocks self-serve updates to billing_type / schedule_type; service_role bypasses for admin tooling.';

drop trigger if exists trg_user_profiles_billing_model_lock on public.user_profiles;
create trigger trg_user_profiles_billing_model_lock
  before update on public.user_profiles
  for each row execute function public.user_profiles_prevent_customer_billing_change();
