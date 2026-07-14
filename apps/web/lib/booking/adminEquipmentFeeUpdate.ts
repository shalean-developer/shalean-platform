import "server-only";

import { bookingIsCustomerPaymentSettled } from "@/lib/booking/bookingPaymentSettlementState";
import { PAYMENT_AMOUNT_MISMATCH_EPS_CENTS } from "@/lib/payments/paymentAmountMismatch";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";

export type AdminEquipmentFeeBookingRow = {
  id: string;
  location: string | null;
  suburb: string | null;
  status: string | null;
  payment_status: string | null;
  payment_completed_at: string | null;
  total_price: number | string | null;
  total_paid_zar: number | string | null;
  total_paid_cents: number | string | null;
  amount_paid_cents: number | string | null;
  equipment_logistics_fee: number | string | null;
  equipment_required: boolean | null;
  manual_quote_required: boolean | null;
};

export type AdminEquipmentFeeUpdatePatch = {
  patch: Record<string, unknown>;
  nextFee: number;
  nextTotalPrice: number;
  preservedCashZar: number;
  paymentMismatch: boolean;
  paid: boolean;
};

function zarNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function collectedCashZar(row: AdminEquipmentFeeBookingRow): number {
  const cents = Number(row.amount_paid_cents ?? row.total_paid_cents);
  if (Number.isFinite(cents) && cents > 0) return Math.round(cents / 100);
  const zar = zarNumber(row.total_paid_zar);
  return zar > 0 ? Math.round(zar) : 0;
}

/**
 * Paid-safe equipment fee update: preserve collected cash; adjust payable `total_price`.
 * Mirrors admin edit-details Phase 1 cash immutability.
 */
export function buildAdminEquipmentFeeUpdatePatch(params: {
  existing: AdminEquipmentFeeBookingRow;
  equipmentPatch: Record<string, unknown>;
  nextFee: number;
  prevFee: number;
}): AdminEquipmentFeeUpdatePatch {
  const { existing, equipmentPatch, nextFee, prevFee } = params;
  const feeDelta = nextFee - prevFee;
  const prevPayable = zarNumber(existing.total_price);
  const fallbackPayable = collectedCashZar(existing) || zarNumber(existing.total_paid_zar);
  const basePayable = prevPayable > 0 ? prevPayable : fallbackPayable;
  const nextTotalPrice = Math.max(0, Math.round(basePayable + feeDelta));

  const paid = bookingIsCustomerPaymentSettled({
    status: existing.status,
    payment_status: existing.payment_status,
    payment_completed_at: existing.payment_completed_at,
    amount_paid_cents: Number(existing.amount_paid_cents ?? 0),
    total_paid_cents: Number(existing.total_paid_cents ?? 0),
    total_paid_zar: Number(existing.total_paid_zar ?? 0),
  });
  const cashZar = collectedCashZar(existing);
  const cashCents = Math.round(cashZar * 100);
  const paymentMismatch =
    paid && Math.abs(nextTotalPrice * 100 - cashCents) > PAYMENT_AMOUNT_MISMATCH_EPS_CENTS;

  if (paid && feeDelta !== 0) {
    logPaymentStructured("admin_paid_booking_price_change", {
      booking_id: existing.id,
      surface: "equipment",
      fee_delta_zar: feeDelta,
      next_total_price_zar: nextTotalPrice,
      amount_paid_cents_preserved: cashCents,
      payment_mismatch: paymentMismatch,
      payment_status: existing.payment_status ?? null,
      booking_status: existing.status ?? null,
    });
  }

  const patch: Record<string, unknown> = {
    ...equipmentPatch,
    total_price: nextTotalPrice,
  };

  if (paid) {
    // Never rewrite gateway-collected amounts.
    patch.payment_mismatch = paymentMismatch;
  } else {
    patch.amount_paid_cents = 0;
    patch.total_paid_cents = 0;
    patch.total_paid_zar = 0;
  }

  return {
    patch,
    nextFee,
    nextTotalPrice,
    preservedCashZar: paid ? cashZar : 0,
    paymentMismatch,
    paid,
  };
}
