-- Mode-aware hybrid payout cap: prepaid uses collected-cash semantics; invoice/recurring uses
-- service/invoice line value (total_paid_zar * 100) before amount_paid_cents so COALESCE(..., 0, ...)
-- does not collapse to 0 while work is unpaid.

-- ---------------------------------------------------------------------------
-- billing_type: explicit classification for financial checks + reporting
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists billing_type text not null default 'prepaid';

alter table public.bookings
  drop constraint if exists bookings_billing_type_check;

alter table public.bookings
  add constraint bookings_billing_type_check
  check (
    billing_type in ('prepaid', 'recurring_invoice', 'monthly_contract', 'pay_later')
  )
  not valid;

comment on column public.bookings.billing_type is
  'Financial mode: prepaid (collected cash caps hybrid payout), recurring_invoice / monthly_contract / pay_later (accrual cap from invoice line / service value before customer settlement).';

-- ---------------------------------------------------------------------------
-- Backfill before VALIDATE
-- ---------------------------------------------------------------------------
update public.bookings b
set billing_type = 'recurring_invoice'
where
  coalesce(b.is_monthly_billing_booking, false)
  or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
  or b.monthly_invoice_id is not null;

update public.bookings b
set billing_type = 'prepaid'
where coalesce(b.billing_type, '') not in ('prepaid', 'recurring_invoice', 'monthly_contract', 'pay_later');

-- ---------------------------------------------------------------------------
-- BEFORE trigger: keep billing_type aligned with monthly / invoice signals
-- ---------------------------------------------------------------------------
create or replace function public.bookings_normalize_billing_type()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.billing_type in ('pay_later', 'monthly_contract') then
    return new;
  end if;

  if coalesce(new.is_monthly_billing_booking, false)
     or lower(trim(coalesce(new.payment_status, ''))) = 'pending_monthly'
     or new.monthly_invoice_id is not null
  then
    new.billing_type := 'recurring_invoice';
    return new;
  end if;

  if new.billing_type is null
     or btrim(coalesce(new.billing_type, '')) = ''
     or lower(trim(coalesce(new.billing_type, ''))) not in ('prepaid', 'recurring_invoice', 'monthly_contract', 'pay_later')
  then
    new.billing_type := 'prepaid';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_normalize_billing_type on public.bookings;
create trigger trg_bookings_normalize_billing_type
  before insert
  or update of is_monthly_billing_booking, payment_status, monthly_invoice_id, billing_type
  on public.bookings
  for each row
  execute function public.bookings_normalize_billing_type();

-- ---------------------------------------------------------------------------
-- Replace prepaid-only hybrid cap with mode-aware cap
-- ---------------------------------------------------------------------------
alter table public.bookings
  drop constraint if exists bookings_cleaner_earnings_lte_total_paid;

alter table public.bookings
  add constraint bookings_cleaner_payout_lte_financial_cap
  check (
    cleaner_payout_cents is null
    or (
      coalesce(cleaner_payout_cents, 0) + coalesce(cleaner_bonus_cents, 0)
      <= (
        case
          when lower(trim(coalesce(billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
            or coalesce(is_monthly_billing_booking, false)
            or lower(trim(coalesce(payment_status, ''))) = 'pending_monthly'
            or monthly_invoice_id is not null
          then coalesce(
            total_paid_cents,
            case
              when total_paid_zar is not null and total_paid_zar > 0 then round(total_paid_zar * 100)::bigint
            end,
            nullif(amount_paid_cents, 0),
            0::bigint
          )
          else coalesce(
            total_paid_cents,
            amount_paid_cents,
            case
              when total_paid_zar is not null and total_paid_zar > 0 then round(total_paid_zar * 100)::integer
            end
          )
        end
      )
    )
  )
  not valid;

-- Fail fast if any row violates the new cap (should be empty after recurring backfill semantics)
do $$
declare
  v_bad bigint;
begin
  select count(*) into v_bad
  from public.bookings b
  where b.cleaner_payout_cents is not null
    and coalesce(b.cleaner_payout_cents, 0) + coalesce(b.cleaner_bonus_cents, 0)
      > (
        case
          when lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
            or coalesce(b.is_monthly_billing_booking, false)
            or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
            or b.monthly_invoice_id is not null
          then coalesce(
            b.total_paid_cents,
            case
              when b.total_paid_zar is not null and b.total_paid_zar > 0 then round(b.total_paid_zar * 100)::bigint
            end,
            nullif(b.amount_paid_cents, 0),
            0::bigint
          )
          else coalesce(
            b.total_paid_cents,
            b.amount_paid_cents,
            case
              when b.total_paid_zar is not null and b.total_paid_zar > 0 then round(b.total_paid_zar * 100)::integer
            end
          )
        end
      );

  if v_bad > 0 then
    raise exception 'bookings_cleaner_payout_lte_financial_cap: % rows violate new cap before VALIDATE', v_bad;
  end if;
end
$$;

alter table public.bookings validate constraint bookings_billing_type_check;
alter table public.bookings validate constraint bookings_cleaner_payout_lte_financial_cap;

comment on constraint bookings_cleaner_payout_lte_financial_cap on public.bookings is
  'Hybrid cleaner_payout+bonus must not exceed: prepaid → coalesce(total_paid_cents, amount_paid_cents, zar_minor); invoice/recurring → coalesce(total_paid_cents, zar_minor, nullif(amount_paid_cents,0),0) so explicit 0 paid does not mask quoted line value.';
