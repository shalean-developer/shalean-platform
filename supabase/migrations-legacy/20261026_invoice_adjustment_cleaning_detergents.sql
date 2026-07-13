-- Add cleaning_detergents as an invoice adjustment category (admin extra charge).

alter table public.invoice_adjustments
  drop constraint if exists invoice_adjustments_category_check;

alter table public.invoice_adjustments
  add constraint invoice_adjustments_category_check
  check (category in (
    'missed_visit',
    'extra_service',
    'discount',
    'late_fee',
    'cleaning_detergents',
    'other'
  ));

comment on column public.invoice_adjustments.category is
  'Preset classification: missed_visit, extra_service, discount, late_fee, cleaning_detergents, other.';
