create table if not exists public.customer_monthly_billing_terms (
  customer_id uuid primary key,
  due_day smallint not null check (due_day between 1 and 28),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.apply_customer_monthly_due_day()
returns trigger
language plpgsql
as $$
declare
  v_due_day smallint;
  v_year int;
  v_month int;
  v_next date;
begin
  if new.status not in ('draft','sent','overdue','partially_paid') then
    return new;
  end if;

  select due_day into v_due_day
  from public.customer_monthly_billing_terms
  where customer_id = new.customer_id and active = true;

  if v_due_day is null then
    return new;
  end if;

  v_year := split_part(new.month, '-', 1)::int;
  v_month := split_part(new.month, '-', 2)::int;
  v_next := (make_date(v_year, v_month, 1) + interval '1 month')::date;
  new.due_date := make_date(
    extract(year from v_next)::int,
    extract(month from v_next)::int,
    v_due_day
  );
  new.is_overdue := new.due_date < (now() at time zone 'Africa/Johannesburg')::date;
  return new;
end;
$$;

drop trigger if exists trg_apply_customer_monthly_due_day on public.monthly_invoices;
create trigger trg_apply_customer_monthly_due_day
before insert or update of customer_id, month, due_date, status
on public.monthly_invoices
for each row execute function public.apply_customer_monthly_due_day();
