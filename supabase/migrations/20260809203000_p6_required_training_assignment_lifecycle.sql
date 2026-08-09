-- P6 closeout: make mandatory training actionable for every active cleaner.
-- Existing active cleaners receive every active required module once.
-- New/reactivated cleaners and newly-required modules converge automatically.

insert into public.cleaner_training_assignments (
  cleaner_id,
  module_id,
  status,
  due_at
)
select
  c.id,
  m.id,
  'assigned',
  now() + interval '30 days'
from public.cleaners c
cross join public.workforce_training_modules m
where c.is_active = true
  and m.is_active = true
  and m.is_required = true
on conflict (cleaner_id, module_id) do nothing;

create or replace function public.p6_assign_required_training_for_cleaner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active = true then
    insert into public.cleaner_training_assignments (
      cleaner_id,
      module_id,
      status,
      due_at
    )
    select
      new.id,
      m.id,
      'assigned',
      now() + interval '30 days'
    from public.workforce_training_modules m
    where m.is_active = true
      and m.is_required = true
    on conflict (cleaner_id, module_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.p6_assign_required_training_for_cleaner() from public, anon, authenticated;
grant execute on function public.p6_assign_required_training_for_cleaner() to service_role;

drop trigger if exists p6_assign_required_training_on_cleaner on public.cleaners;
create trigger p6_assign_required_training_on_cleaner
after insert or update of is_active on public.cleaners
for each row
when (new.is_active = true)
execute function public.p6_assign_required_training_for_cleaner();

create or replace function public.p6_assign_required_training_for_module()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active = true and new.is_required = true then
    insert into public.cleaner_training_assignments (
      cleaner_id,
      module_id,
      status,
      due_at
    )
    select
      c.id,
      new.id,
      'assigned',
      now() + interval '30 days'
    from public.cleaners c
    where c.is_active = true
    on conflict (cleaner_id, module_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.p6_assign_required_training_for_module() from public, anon, authenticated;
grant execute on function public.p6_assign_required_training_for_module() to service_role;

drop trigger if exists p6_assign_required_training_on_module on public.workforce_training_modules;
create trigger p6_assign_required_training_on_module
after insert or update of is_active, is_required on public.workforce_training_modules
for each row
when (new.is_active = true and new.is_required = true)
execute function public.p6_assign_required_training_for_module();
