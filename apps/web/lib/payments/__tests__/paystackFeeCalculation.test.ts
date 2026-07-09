import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  calculatePaystackSaFee,
  resolvePaystackProcessingFee,
} from "@/lib/payments/paystackFeeCalculation";

describe("calculatePaystackSaFee", () => {
  it("applies local card rate 2.9% + R1 + VAT", () => {
    const fee = calculatePaystackSaFee(10_000, "card", false);
    const base = Math.round(10_000 * 0.029) + 100;
    const vat = Math.round(base * 0.15);
    expect(fee.processing_fee_cents).toBe(base + vat);
    expect(fee.fee_calculation_method).toBe("calculated_sa_local_card");
  });

  it("applies international card rate 3.1% + R1 + VAT", () => {
    const fee = calculatePaystackSaFee(10_000, "card", true);
    expect(fee.fee_calculation_method).toBe("calculated_sa_international_card");
    expect(fee.processing_fee_cents).toBeGreaterThan(
      calculatePaystackSaFee(10_000, "card", false).processing_fee_cents,
    );
  });

  it("applies EFT rate 2% + VAT without flat fee", () => {
    const fee = calculatePaystackSaFee(10_000, "eft");
    const base = Math.round(10_000 * 0.02);
    const vat = Math.round(base * 0.15);
    expect(fee.processing_fee_cents).toBe(base + vat);
    expect(fee.fee_calculation_method).toBe("calculated_sa_eft");
  });
});

describe("resolvePaystackProcessingFee", () => {
  it("prefers Paystack-reported fees when present", () => {
    const resolved = resolvePaystackProcessingFee(25_000, { fees: 890, channel: "card" });
    expect(resolved.processing_fee_cents).toBe(890);
    expect(resolved.fee_calculation_method).toBe("paystack_reported");
  });

  it("falls back to SA calculation when fees absent", () => {
    const resolved = resolvePaystackProcessingFee(10_000, { channel: "card" });
    expect(resolved.fee_calculation_method).toBe("calculated_sa_local_card");
    expect(resolved.processing_fee_cents).toBeGreaterThan(0);
  });
});
