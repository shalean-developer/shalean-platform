/**
 * AUDIT-02A01 Piece 1 — canonical financial contract.
 *
 * Separates service value, collected cash, settlement state, monthly invoice state,
 * and cleaner earnings basis. Pure only: later pieces adopt these helpers at mutation
 * boundaries after their own audit/regression/staging gates.
 */

export type BookingFinancialMode =
  | "checkout_unsettled"
  | "checkout_settled"
  | "monthly_draft"
  | "monthly_sent"
  | "monthly_paid"
  | "monthly_refunded"
  | "monthly_unknown"
  | "covered_zero"
  | "legacy_unknown";

export type BookingFinancialContractRow = {
  payment_status?: string | null;
  status?: string | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
  monthly_invoice_status?: string | null;
  total_price?: number | null;
  amount_paid_cents?: number | null;
  total_paid_cents?: number | null;
  total_paid_zar?: number | null;
};

export const BOOKING_FINANCIAL_FIELD_AUTHORITY = {
  serviceValue: {
    canonical: "booking_line_items_then_total_price",
  },
  collectedCash: {
    canonical: "amount_paid_cents",
    mirrors: ["total_paid_cents", "total_paid_zar"],
  },
  checkoutSettlement: {
    canonical: "payment_status_plus_payment_ledger",
  },
  monthlySettlement: {
    canonical: "monthly_invoice_status_plus_payment_ledger",
  },
  cleanerEarnings: {
    canonical: "eligible_booking_line_items",
    fallback: "canonical_service_value",
  },
} as const;

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isMonthlyBillingContext(row: BookingFinancialContractRow): boolean {
  const billingType = norm(row.billing_type);
  return (
    row.is_monthly_billing_booking === true ||
    Boolean(String(row.monthly_invoice_id ?? "").trim()) ||
    norm(row.payment_status) === "pending_monthly" ||
    billingType === "monthly_contract" ||
    billingType === "recurring_invoice" ||
    billingType === "pay_later"
  );
}

export function classifyBookingFinancialMode(
  row: BookingFinancialContractRow,
): BookingFinancialMode {
  if (isMonthlyBillingContext(row)) {
    const invoiceStatus = norm(row.monthly_invoice_status);
    const hasAttachedInvoice = Boolean(String(row.monthly_invoice_id ?? "").trim());

    if (invoiceStatus === "refunded") return "monthly_refunded";
    if (invoiceStatus === "paid" || invoiceStatus === "closed") return "monthly_paid";
    if (
      invoiceStatus === "sent" ||
      invoiceStatus === "partially_paid" ||
      invoiceStatus === "overdue"
    ) {
      return "monthly_sent";
    }
    if (invoiceStatus === "draft") return "monthly_draft";
    if (hasAttachedInvoice) return "monthly_unknown";
    return "monthly_draft";
  }

  const paymentStatus = norm(row.payment_status);
  if (
    paymentStatus === "success" ||
    paymentStatus === "paid" ||
    paymentStatus === "succeeded" ||
    paymentStatus === "completed"
  ) {
    const cash = Number(row.amount_paid_cents ?? 0);
    return Number.isFinite(cash) && cash === 0 ? "covered_zero" : "checkout_settled";
  }

  if (norm(row.status) === "pending_payment" || norm(row.status) === "payment_expired") {
    return "checkout_unsettled";
  }

  return "legacy_unknown";
}

export function canonicalCollectedCashCents(row: BookingFinancialContractRow): number {
  const cents = Number(row.amount_paid_cents ?? 0);
  if (!Number.isFinite(cents) || cents < 0) return 0;
  return Math.round(cents);
}

export function canonicalServiceValueCents(params: {
  booking: BookingFinancialContractRow;
  eligibleLineItemsSubtotalCents?: number | null;
}): number | null {
  const lineSubtotalRaw = params.eligibleLineItemsSubtotalCents;
  if (lineSubtotalRaw !== null && lineSubtotalRaw !== undefined) {
    const lineSubtotal = Number(lineSubtotalRaw);
    if (Number.isFinite(lineSubtotal) && lineSubtotal >= 0) {
      return Math.round(lineSubtotal);
    }
  }

  const totalPriceRaw = params.booking.total_price;
  if (totalPriceRaw !== null && totalPriceRaw !== undefined) {
    const totalPrice = Number(totalPriceRaw);
    if (Number.isFinite(totalPrice) && totalPrice >= 0) {
      return Math.round(totalPrice * 100);
    }
  }

  return null;
}

export function legacyTotalPaidZarIsAuthoritative(): false {
  return false;
}
