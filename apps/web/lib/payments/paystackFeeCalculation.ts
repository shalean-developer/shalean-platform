import "server-only";

import type {
  FeeCalculationMethod,
  PaystackChargePayload,
  ResolvedProcessingFee,
} from "@/lib/payments/paymentTransactionTypes";

const SA_VAT_RATE = 0.15;
const SA_LOCAL_FLAT_CENTS = 100;
const SA_INTERNATIONAL_FLAT_CENTS = 100;

/** Paystack SA: 2.9% + R1 local; 3.1% + R1 international; 2% EFT (VAT on fee). */
export function calculatePaystackSaFee(
  amountCents: number,
  channel?: string | null,
  international?: boolean,
): ResolvedProcessingFee {
  const amount = Math.max(0, Math.round(amountCents));
  const ch = (channel ?? "").toLowerCase();

  let method: FeeCalculationMethod = "calculated_sa_default";
  let percent = 0.029;
  let flatCents = SA_LOCAL_FLAT_CENTS;

  if (ch === "eft" || ch === "bank" || ch === "bank_transfer") {
    method = "calculated_sa_eft";
    percent = 0.02;
    flatCents = 0;
  } else if (international) {
    method = "calculated_sa_international_card";
    percent = 0.031;
    flatCents = SA_INTERNATIONAL_FLAT_CENTS;
  } else {
    method = "calculated_sa_local_card";
    percent = 0.029;
    flatCents = SA_LOCAL_FLAT_CENTS;
  }

  const baseFee = Math.round(amount * percent) + flatCents;
  const vatCents = Math.round(baseFee * SA_VAT_RATE);
  const totalFee = baseFee + vatCents;

  return {
    processing_fee_cents: totalFee,
    processing_fee_vat_cents: vatCents,
    fee_calculation_method: method,
    payment_channel: ch || "card",
  };
}

function isInternationalCharge(data: PaystackChargePayload): boolean {
  if (data.international_format_transaction === true) return true;
  const country = data.authorization?.country_code;
  if (country && country.toUpperCase() !== "ZA") return true;
  return false;
}

/**
 * Prefer Paystack-reported `fees` from charge.success / verify response.
 * Paystack returns fees in the smallest currency unit (cents for ZAR).
 */
export function resolvePaystackProcessingFee(
  amountCents: number,
  data: PaystackChargePayload,
): ResolvedProcessingFee {
  const channel = typeof data.channel === "string" ? data.channel : null;

  if (typeof data.fees === "number" && data.fees >= 0) {
    const reported = Math.round(data.fees);
    const vatFromBreakdown = extractVatFromFeesBreakdown(data.fees_breakdown);
    return {
      processing_fee_cents: reported,
      processing_fee_vat_cents: vatFromBreakdown,
      fee_calculation_method: "paystack_reported",
      payment_channel: channel,
    };
  }

  return calculatePaystackSaFee(amountCents, channel, isInternationalCharge(data));
}

function extractVatFromFeesBreakdown(breakdown: unknown): number | null {
  if (!breakdown || typeof breakdown !== "object") return null;
  const b = breakdown as Record<string, unknown>;
  for (const key of ["vat", "tax", "vat_cents"]) {
    const v = b[key];
    if (typeof v === "number" && v >= 0) return Math.round(v);
  }
  return null;
}
