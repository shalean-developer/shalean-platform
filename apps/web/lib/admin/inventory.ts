export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  item_type: "supply" | "equipment";
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost_cents: number;
  is_active: boolean;
};

export function summarizeInventory(items: readonly InventoryItem[]) {
  const active = items.filter((item) => item.is_active);
  return {
    activeItems: active.length,
    lowStockItems: active.filter((item) => item.quantity_on_hand <= item.reorder_level).length,
    stockValueCents: active.reduce(
      (sum, item) => sum + Math.round(item.quantity_on_hand * item.unit_cost_cents),
      0,
    ),
  };
}

export function inventoryMovementNeedsBooking(type: string): boolean {
  return type === "consume";
}

