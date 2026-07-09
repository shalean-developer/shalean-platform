-- Income / sales budgets: track planned revenue vs completed booking sales.

alter table public.finance_budgets
  add column if not exists budget_type text not null default 'expense'
    check (budget_type in ('expense', 'income'));

alter table public.finance_budget_lines
  add column if not exists service_slug text,
  add column if not exists is_total_line boolean not null default false;

alter table public.finance_budget_lines
  drop constraint if exists finance_budget_lines_target_check;

alter table public.finance_budget_lines
  add constraint finance_budget_lines_target_check check (
    is_total_line = true
    or category_id is not null
    or branch_id is not null
    or vendor_id is not null
    or service_slug is not null
  );

create index if not exists finance_budgets_type_idx
  on public.finance_budgets (budget_type, period_start, period_end)
  where is_active = true;
