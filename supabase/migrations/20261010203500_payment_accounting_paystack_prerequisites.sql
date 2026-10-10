-- PAYMENT-ACCOUNTING: converge required Paystack fee accounting prerequisites
-- across environments. Production already has these rows; staging may not.
-- Idempotent on the canonical unique keys.

insert into public.expense_categories (group_name, name, is_system, is_active)
values ('Technology', 'Paystack Fees', true, true)
on conflict (group_name, name) do update
set is_system = true,
    is_active = true;

insert into public.expense_accounts (name, account_type, is_active, balance_cents, sync_status, updated_at)
values ('Paystack Balance', 'paystack', true, 0, 'not_synced', now())
on conflict (name) do update
set account_type = 'paystack',
    is_active = true,
    updated_at = now();
