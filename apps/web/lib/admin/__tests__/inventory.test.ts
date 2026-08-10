import { describe, expect, it } from "vitest";
import { inventoryMovementNeedsBooking, summarizeInventory } from "@/lib/admin/inventory";

describe("inventory controls", () => {
  it("flags low stock and values active stock", () => {
    expect(summarizeInventory([
      { id: "1", sku: "SOAP", name: "Soap", item_type: "supply", unit: "l", quantity_on_hand: 4, reorder_level: 5, unit_cost_cents: 1200, is_active: true },
      { id: "2", sku: "VAC", name: "Vacuum", item_type: "equipment", unit: "unit", quantity_on_hand: 2, reorder_level: 1, unit_cost_cents: 80000, is_active: true },
      { id: "3", sku: "OLD", name: "Old", item_type: "supply", unit: "unit", quantity_on_hand: 99, reorder_level: 100, unit_cost_cents: 999, is_active: false },
    ])).toEqual({ activeItems: 2, lowStockItems: 1, stockValueCents: 164800 });
  });

  it("requires a booking for consumed supplies", () => {
    expect(inventoryMovementNeedsBooking("consume")).toBe(true);
    expect(inventoryMovementNeedsBooking("purchase")).toBe(false);
  });
});

