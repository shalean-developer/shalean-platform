-- BOOKING-E2E-14B.3
-- Preserve the payout financial safety cap while allowing a successfully settled
-- prepaid booking to use its authoritative visit subtotal when customer cash is
-- reduced by company-funded value (Cleaning Credit / promo / referral).
--
-- This does NOT invent collected cash and does NOT change R0 payment settlement.
-- Before payment success, prepaid rows remain capped by collected cash only.

begin;

alter table public.bookings
  drop constraint if exists bookings_cleaner_payout_lte_financial_cap;

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
            total_paid_cents::bigint,
            case
              when total_paid_zar is not null and total_paid_zar > 0
                then round(total_paid_zar * 100)::bigint
            end,
            nullif(amount_paid_cents, 0)::bigint,
            0::bigint
          )
          else
            case
              when lower(trim(coalesce(payment_status, ''))) = 'success'
              then greatest(
                coalesce(
                  total_paid_cents::bigint,
                  amount_paid_cents::bigint,
                  case
                    when total_paid_zar is not null and total_paid_zar > 0
                      then round(total_paid_zar * 100)::bigint
                  end,
                  0::bigint
                ),
                coalesce(base_amount_cents::bigint, 0::bigint)
              )
              else coalesce(
                total_paid_cents::bigint,
                amount_paid_cents::bigint,
                case
                  when total_paid_zar is not null and total_paid_zar > 0
                    then round(total_paid_zar * 100)::bigint
                end,
                0::bigint
              )
            end
        end
      )
    )
  )
  not valid;

alter table public.bookings
  validate constraint bookings_cleaner_payout_lte_financial_cap;

comment on constraint bookings_cleaner_payout_lte_financial_cap on public.bookings is
  'Hybrid cleaner payout+bonus cap: accrual uses invoice/service value; unpaid prepaid uses collected cash only; successfully settled prepaid may use the greater of collected cash or authoritative base_amount_cents so company-funded credits/discounts do not collapse the cleaner cap to R0.';

commit;
