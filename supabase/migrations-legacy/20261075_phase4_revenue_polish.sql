-- Phase 4: R0 settlement ledger, maker–checker reprice, catalog rollback metadata.

-- Allow zero-amount settlement rows (promo/credit fully-covered bookings).
alter table public.payment_transactions
  drop constraint if exists payment_transactions_amount_cents_check;

alter table public.payment_transactions
  add constraint payment_transactions_amount_cents_check
  check (amount_cents >= 0);

comment on column public.payment_transactions.amount_cents is
  'Gross amount in cents. Zero allowed for promo/credit fully-covered settlements (payment_channel=promo_credit_cover).';

-- Extend maker–checker to paid booking reprice.
alter table public.admin_money_action_proposals
  drop constraint if exists admin_money_action_proposals_action_type_check;

alter table public.admin_money_action_proposals
  add constraint admin_money_action_proposals_action_type_check
  check (action_type in (
    'adjust_payout_earnings',
    'adjust_team_payout_earnings',
    'reprice_booking_details'
  ));

comment on table public.admin_money_action_proposals is
  'Maker–checker proposals for earnings adjust and paid booking reprice when PAYOUT_MAKER_CHECKER / BOOKING_REPRICE_MAKER_CHECKER=true.';

-- Catalog audit: allow rollback action + optional pointer to source audit row.
alter table public.pricing_catalog_audit
  drop constraint if exists pricing_catalog_audit_action_check;

alter table public.pricing_catalog_audit
  add constraint pricing_catalog_audit_action_check
  check (action in ('insert', 'update', 'delete', 'rollback'));

alter table public.pricing_catalog_audit
  add column if not exists rollback_of uuid references public.pricing_catalog_audit (id) on delete set null;
