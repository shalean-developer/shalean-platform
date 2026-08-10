-- P9 inventory: auditable stock, booking consumption cost, and equipment custody.

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  item_type text not null check (item_type in ('supply','equipment')),
  unit text not null default 'unit',
  quantity_on_hand numeric(12,2) not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric(12,2) not null default 0 check (reorder_level >= 0),
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_equipment_issues (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  booking_id uuid null references public.bookings(id) on delete set null,
  cleaner_id uuid null references public.cleaners(id) on delete set null,
  team_id uuid null references public.teams(id) on delete set null,
  status text not null default 'issued' check (status in ('issued','returned','lost')),
  issued_at timestamptz not null default now(),
  due_at timestamptz null,
  returned_at timestamptz null,
  condition_out text null,
  condition_in text null,
  notes text null,
  issued_by uuid null references auth.users(id) on delete set null,
  closed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cleaner_id is not null or team_id is not null or booking_id is not null)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('purchase','consume','issue','return','loss','adjustment_in','adjustment_out')),
  quantity_delta numeric(12,2) not null check (quantity_delta <> 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  total_cost_cents integer not null check (total_cost_cents >= 0),
  booking_id uuid null references public.bookings(id) on delete set null,
  equipment_issue_id uuid null references public.inventory_equipment_issues(id) on delete set null,
  cleaner_id uuid null references public.cleaners(id) on delete set null,
  team_id uuid null references public.teams(id) on delete set null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_items_reorder_idx on public.inventory_items(is_active, quantity_on_hand, reorder_level);
create index if not exists inventory_movements_item_created_idx on public.inventory_movements(item_id, created_at desc);
create index if not exists inventory_movements_booking_idx on public.inventory_movements(booking_id) where booking_id is not null;
create index if not exists inventory_equipment_issues_open_idx on public.inventory_equipment_issues(status, due_at) where status = 'issued';

create or replace function public.record_inventory_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_booking_id uuid default null,
  p_cleaner_id uuid default null,
  p_team_id uuid default null,
  p_notes text default null,
  p_actor uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_delta numeric(12,2);
  v_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;
  if p_movement_type not in ('purchase','consume','loss','adjustment_in','adjustment_out') then
    raise exception 'unsupported general movement type';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id and is_active for update;
  if not found then raise exception 'inventory item not found'; end if;
  if p_movement_type = 'consume' and v_item.item_type <> 'supply' then
    raise exception 'only supply items can be consumed on a booking';
  end if;
  v_delta := case when p_movement_type in ('purchase','adjustment_in') then p_quantity else -p_quantity end;
  if v_item.quantity_on_hand + v_delta < 0 then raise exception 'insufficient stock'; end if;
  insert into public.inventory_movements(item_id,movement_type,quantity_delta,unit_cost_cents,total_cost_cents,booking_id,cleaner_id,team_id,notes,created_by)
  values (p_item_id,p_movement_type,v_delta,v_item.unit_cost_cents,round(abs(v_delta) * v_item.unit_cost_cents),p_booking_id,p_cleaner_id,p_team_id,nullif(trim(p_notes),''),p_actor)
  returning id into v_id;
  update public.inventory_items set quantity_on_hand = quantity_on_hand + v_delta, updated_at = now() where id = p_item_id;
  return v_id;
end;
$$;

create or replace function public.issue_inventory_equipment(
  p_item_id uuid, p_quantity numeric, p_booking_id uuid default null,
  p_cleaner_id uuid default null, p_team_id uuid default null,
  p_due_at timestamptz default null, p_condition_out text default null,
  p_notes text default null, p_actor uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_item public.inventory_items%rowtype; v_issue_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;
  if p_booking_id is null and p_cleaner_id is null and p_team_id is null then raise exception 'custodian or booking is required'; end if;
  select * into v_item from public.inventory_items where id = p_item_id and is_active for update;
  if not found or v_item.item_type <> 'equipment' then raise exception 'active equipment item not found'; end if;
  if v_item.quantity_on_hand < p_quantity then raise exception 'insufficient stock'; end if;
  insert into public.inventory_equipment_issues(item_id,quantity,booking_id,cleaner_id,team_id,due_at,condition_out,notes,issued_by)
  values (p_item_id,p_quantity,p_booking_id,p_cleaner_id,p_team_id,p_due_at,nullif(trim(p_condition_out),''),nullif(trim(p_notes),''),p_actor)
  returning id into v_issue_id;
  insert into public.inventory_movements(item_id,movement_type,quantity_delta,unit_cost_cents,total_cost_cents,booking_id,equipment_issue_id,cleaner_id,team_id,notes,created_by)
  values (p_item_id,'issue',-p_quantity,v_item.unit_cost_cents,round(p_quantity * v_item.unit_cost_cents),p_booking_id,v_issue_id,p_cleaner_id,p_team_id,p_notes,p_actor);
  update public.inventory_items set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now() where id = p_item_id;
  return v_issue_id;
end;
$$;

create or replace function public.close_inventory_equipment_issue(
  p_issue_id uuid, p_outcome text, p_condition_in text default null,
  p_notes text default null, p_actor uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_issue public.inventory_equipment_issues%rowtype; v_item public.inventory_items%rowtype; v_movement_id uuid;
begin
  if p_outcome not in ('returned','lost') then raise exception 'outcome must be returned or lost'; end if;
  select * into v_issue from public.inventory_equipment_issues where id = p_issue_id and status = 'issued' for update;
  if not found then raise exception 'open equipment issue not found'; end if;
  select * into v_item from public.inventory_items where id = v_issue.item_id for update;
  update public.inventory_equipment_issues set status=p_outcome, returned_at=case when p_outcome='returned' then now() else null end,
    condition_in=nullif(trim(p_condition_in),''), notes=coalesce(nullif(trim(p_notes),''),notes), closed_by=p_actor, updated_at=now()
  where id=p_issue_id;
  if p_outcome='returned' then
    insert into public.inventory_movements(item_id,movement_type,quantity_delta,unit_cost_cents,total_cost_cents,booking_id,equipment_issue_id,cleaner_id,team_id,notes,created_by)
    values (v_issue.item_id,'return',v_issue.quantity,v_item.unit_cost_cents,round(v_issue.quantity*v_item.unit_cost_cents),v_issue.booking_id,v_issue.id,v_issue.cleaner_id,v_issue.team_id,p_notes,p_actor)
    returning id into v_movement_id;
    update public.inventory_items set quantity_on_hand=quantity_on_hand+v_issue.quantity,updated_at=now() where id=v_issue.item_id;
    return v_movement_id;
  end if;
  -- The original issue already removed the asset from on-hand stock. Marking it
  -- lost closes custody without applying a second stock decrement.
  return p_issue_id;
end;
$$;

create or replace view public.booking_inventory_costs with (security_invoker = true) as
select booking_id, sum(total_cost_cents)::bigint as supply_cost_cents
from public.inventory_movements
where booking_id is not null and movement_type in ('consume','loss')
group by booking_id;

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_equipment_issues enable row level security;
revoke all on table public.inventory_items, public.inventory_movements, public.inventory_equipment_issues from anon, authenticated;
revoke all on function public.record_inventory_movement(uuid,text,numeric,uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.issue_inventory_equipment(uuid,numeric,uuid,uuid,uuid,timestamptz,text,text,uuid) from public, anon, authenticated;
revoke all on function public.close_inventory_equipment_issue(uuid,text,text,text,uuid) from public, anon, authenticated;
grant all on table public.inventory_items, public.inventory_movements, public.inventory_equipment_issues to service_role;
grant select on public.booking_inventory_costs to service_role;
grant execute on function public.record_inventory_movement(uuid,text,numeric,uuid,uuid,uuid,text,uuid) to service_role;
grant execute on function public.issue_inventory_equipment(uuid,numeric,uuid,uuid,uuid,timestamptz,text,text,uuid) to service_role;
grant execute on function public.close_inventory_equipment_issue(uuid,text,text,text,uuid) to service_role;
