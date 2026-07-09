/**
 * Profit calculations: Gross Margin = Revenue − Cleaner Payouts; Net Profit = Gross Margin − Operating Expenses.
 * Only approved expenses count toward operating expenses.
 */

export type ProfitBreakdown = {
  customer_revenue_cents: number;
  cleaner_payouts_cents: number;
  gross_margin_cents: number;
  operating_expenses_cents: number;
  referral_discount_cost_cents: number;
  cleaning_credit_cost_cents: number;
  total_promo_cost_cents: number;
  net_profit_cents: number;
  net_profit_after_promo_cents: number;
  gross_margin_percent: number | null;
  net_profit_percent: number | null;
  expense_ratio_percent: number | null;
};

export function computeProfitBreakdown(
  customerRevenueCents: number,
  cleanerPayoutsCents: number,
  operatingExpensesCents: number,
  referralDiscountCostCents = 0,
  cleaningCreditCostCents = 0,
): ProfitBreakdown {
  const revenue = Math.max(0, Math.round(customerRevenueCents));
  const payouts = Math.max(0, Math.round(cleanerPayoutsCents));
  const expenses = Math.max(0, Math.round(operatingExpensesCents));
  const referralDiscount = Math.max(0, Math.round(referralDiscountCostCents));
  const cleaningCredit = Math.max(0, Math.round(cleaningCreditCostCents));
  const totalPromo = referralDiscount + cleaningCredit;
  const grossMargin = Math.max(0, revenue - payouts);
  const netProfit = grossMargin - expenses;
  const netProfitAfterPromo = netProfit - totalPromo;

  return {
    customer_revenue_cents: revenue,
    cleaner_payouts_cents: payouts,
    gross_margin_cents: grossMargin,
    operating_expenses_cents: expenses,
    referral_discount_cost_cents: referralDiscount,
    cleaning_credit_cost_cents: cleaningCredit,
    total_promo_cost_cents: totalPromo,
    net_profit_cents: netProfit,
    net_profit_after_promo_cents: netProfitAfterPromo,
    gross_margin_percent: revenue > 0 ? Math.round((grossMargin / revenue) * 10000) / 100 : null,
    net_profit_percent: revenue > 0 ? Math.round((netProfitAfterPromo / revenue) * 10000) / 100 : null,
    expense_ratio_percent: revenue > 0 ? Math.round((expenses / revenue) * 10000) / 100 : null,
  };
}

export type BookingProfitBreakdown = {
  customer_payment_cents: number;
  cleaner_payment_cents: number;
  booking_expenses_cents: number;
  processing_fees_cents: number;
  platform_fees_cents: number;
  referral_discount_cents: number;
  cleaning_credit_cents: number;
  net_booking_profit_cents: number;
  profit_margin_percent: number | null;
};

export function computeBookingProfit(
  customerPaymentCents: number,
  cleanerPaymentCents: number,
  bookingExpensesCents: number,
  processingFeesCents = 0,
  platformFeesCents = 0,
  referralDiscountCents = 0,
  cleaningCreditCents = 0,
): BookingProfitBreakdown {
  const customer = Math.max(0, Math.round(customerPaymentCents));
  const cleaner = Math.max(0, Math.round(cleanerPaymentCents));
  const expenses = Math.max(0, Math.round(bookingExpensesCents));
  const processing = Math.max(0, Math.round(processingFeesCents));
  const platform = Math.max(0, Math.round(platformFeesCents));
  const referralDiscount = Math.max(0, Math.round(referralDiscountCents));
  const cleaningCredit = Math.max(0, Math.round(cleaningCreditCents));
  const net = customer - cleaner - expenses - processing - platform - referralDiscount - cleaningCredit;
  return {
    customer_payment_cents: customer,
    cleaner_payment_cents: cleaner,
    booking_expenses_cents: expenses,
    processing_fees_cents: processing,
    platform_fees_cents: platform,
    referral_discount_cents: referralDiscount,
    cleaning_credit_cents: cleaningCredit,
    net_booking_profit_cents: net,
    profit_margin_percent: customer > 0 ? Math.round((net / customer) * 10000) / 100 : null,
  };
}
