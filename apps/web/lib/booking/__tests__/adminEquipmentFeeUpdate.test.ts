import { describe, expect, it } from "vitest";
import { buildAdminEquipmentFeeUpdatePatch } from "@/lib/booking/adminEquipmentFeeUpdate";

describe("buildAdminEquipmentFeeUpdatePatch", () => {
  it("preserves collected cash on paid bookings and updates total_price", () => {
    const built = buildAdminEquipmentFeeUpdatePatch({
      existing: {
        id: "b1",
        location: "1 Main",
        suburb: "Claremont",
        status: "assigned",
        payment_status: "success",
        payment_completed_at: "2026-07-01T00:00:00.000Z",
        total_price: 1000,
        total_paid_zar: 1000,
        total_paid_cents: 100_000,
        amount_paid_cents: 100_000,
        equipment_logistics_fee: 0,
        equipment_required: false,
        manual_quote_required: false,
      },
      equipmentPatch: { equipment_required: true, equipment_logistics_fee: 200 },
      nextFee: 200,
      prevFee: 0,
    });

    expect(built.paid).toBe(true);
    expect(built.patch.total_price).toBe(1200);
    expect(built.patch).not.toHaveProperty("amount_paid_cents");
    expect(built.patch).not.toHaveProperty("total_paid_zar");
    expect(built.preservedCashZar).toBe(1000);
    expect(built.paymentMismatch).toBe(true);
    expect(built.patch.payment_mismatch).toBe(true);
  });

  it("keeps collected cash at zero for unpaid bookings", () => {
    const built = buildAdminEquipmentFeeUpdatePatch({
      existing: {
        id: "b2",
        location: "1 Main",
        suburb: "Claremont",
        status: "pending_payment",
        payment_status: "pending",
        payment_completed_at: null,
        total_price: 800,
        total_paid_zar: 0,
        total_paid_cents: 0,
        amount_paid_cents: 0,
        equipment_logistics_fee: 0,
        equipment_required: false,
        manual_quote_required: false,
      },
      equipmentPatch: { equipment_required: true, equipment_logistics_fee: 150 },
      nextFee: 150,
      prevFee: 0,
    });

    expect(built.paid).toBe(false);
    expect(built.patch.total_price).toBe(950);
    expect(built.patch.amount_paid_cents).toBe(0);
    expect(built.patch.total_paid_zar).toBe(0);
    expect(built.preservedCashZar).toBe(0);
  });
});
