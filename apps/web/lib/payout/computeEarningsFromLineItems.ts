/**
 * Derives the **service price basis** (eligible subtotal in cents) from `booking_line_items`
 * for the same {@link computeBookingEarnings} path (tenure % + service caps).
 *
 * Eligible line types: base, room, bathroom, extra, and **adjustment** (bundles / refunds).
 */

export type EarningsLineItemInput = {
  id: string;
  item_type: string;
  total_price_cents: number;
};

const ELIGIBLE = new Set(["base", "room", "bathroom", "extra", "adjustment"]);

export function isEligibleLineItemType(itemType: string): boolean {
  return ELIGIBLE.has(String(itemType ?? "").toLowerCase());
}

export function sumEligibleLineItemsSubtotalCents(items: readonly EarningsLineItemInput[]): number {
  let s = 0;
  for (const i of items) {
    if (!isEligibleLineItemType(i.item_type)) continue;
    const c = Math.round(Number(i.total_price_cents));
    if (!Number.isFinite(c)) continue;
    s += c;
  }
  return Math.max(0, s);
}

/**
 * Splits `displayCents` across line items by positive `total_price_cents` weights (largest remainder).
 * Lines with non-positive totals get 0 allocation.
 */
export function allocateDisplayCentsAcrossLineItems(
  displayCents: number,
  items: readonly EarningsLineItemInput[],
): { booking_line_item_id: string; allocated_display_earnings_cents: number }[] {
  const d = Math.max(0, Math.floor(displayCents));
  const eligible = items.filter((i) => isEligibleLineItemType(i.item_type));
  const weights = eligible.map((i) => Math.max(0, Math.round(Number(i.total_price_cents) || 0)));
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (eligible.length === 0 || d === 0) {
    return eligible.map((i) => ({ booking_line_item_id: i.id, allocated_display_earnings_cents: 0 }));
  }
  if (sumW <= 0) {
    const base = Math.floor(d / eligible.length);
    let rem = d - base * eligible.length;
    return eligible.map((i, idx) => ({
      booking_line_item_id: i.id,
      allocated_display_earnings_cents: base + (idx < rem ? 1 : 0),
    }));
  }

  const raw = weights.map((w) => (d * w) / sumW);
  const floors = raw.map((x) => Math.floor(x));
  let rem = d - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, idx) => ({ idx, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const alloc = [...floors];
  let k = 0;
  while (rem > 0 && order.length > 0) {
    alloc[order[k % order.length]!.idx]! += 1;
    rem -= 1;
    k += 1;
  }

  return eligible.map((i, idx) => ({
    booking_line_item_id: i.id,
    allocated_display_earnings_cents: alloc[idx] ?? 0,
  }));
}
