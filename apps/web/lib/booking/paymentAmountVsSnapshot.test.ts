import { describe, expect, it } from "vitest";
import {
  isCheckoutCurrencyZar,
  isPaymentAmountMismatchZar,
  maskPaystackReference,
  PAYMENT_AMOUNT_MISMATCH_EPS_ZAR,
} from "@/lib/payments/paymentAmountMismatch";

describe("payment amount vs checkout snapshot (eps)", () => {
  it("uses the shared 1 ZAR hard gate", () => {
    expect(PAYMENT_AMOUNT_MISMATCH_EPS_ZAR).toBe(1);
  });

  it("treats as mismatch when diff exceeds 1 ZAR", () => {
    expect(isPaymentAmountMismatchZar(100, 150)).toBe(true);
    expect(isPaymentAmountMismatchZar(100, 102)).toBe(true);
    expect(isPaymentAmountMismatchZar(100, 101.1)).toBe(true);
  });

  it("allows within epsilon", () => {
    expect(isPaymentAmountMismatchZar(100, 101)).toBe(false);
    expect(isPaymentAmountMismatchZar(100, 100)).toBe(false);
    expect(isPaymentAmountMismatchZar(100, 99.5)).toBe(false);
  });

  it("accepts only ZAR for checkout currency", () => {
    expect(isCheckoutCurrencyZar("ZAR")).toBe(true);
    expect(isCheckoutCurrencyZar("zar")).toBe(true);
    expect(isCheckoutCurrencyZar("USD")).toBe(false);
    expect(isCheckoutCurrencyZar("")).toBe(false);
    expect(isCheckoutCurrencyZar(null)).toBe(false);
  });

  it("masks Paystack references for observability", () => {
    expect(maskPaystackReference("pay_11111111-2222-4333-8444-555555555555")).toBe("pay_111111…");
    expect(maskPaystackReference("short")).toBe("sho…");
    expect(maskPaystackReference("")).toBeNull();
  });
});
