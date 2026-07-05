/**
 * Derives the **service price basis** (eligible subtotal in cents) from `booking_line_items`
 * for the same {@link computeBookingEarnings} path (tenure % + service caps).
 *
 * Phase 2A: eligibility is delegated to the canonical cleaner earnings eligibility resolver.
 */

import { lineItemContributesToCleanerEarnings } from "@/lib/payout/cleanerEarningsEligibility";

export type EarningsLineItemInput = {
  id: string;
  item_type: string;
  slug?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  earns_cleaner?: boolean | null;
  total_price_cents: number;
};

export function isEligibleLineItemType(itemType: string): boolean {
  return lineItemContributesToCleanerEarnings({ item_type: itemType });
}

export function isEligibleLineItem(item: EarningsLineItemInput): boolean {
  return lineItemContributesToCleanerEarnings(item);
}

export function sumEligibleLineItemsSubtotalCents(items: readonly EarningsLineItemInput[]): number {
  let s = 0;
  for (const i of items) {
    if (!isEligibleLineItem(i)) continue;
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
  const eligible = items.filter(isEligibleLineItem);
  const weights = eligible.map((i) => Math.max(0, Math.round(Number(i.total_price_cents) || 0)));
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (eligible.length === 0 || d === 0) {
    return eligible.map((i) => ({ booking_line_item_id: i.id, allocated_display_earnings_cents: 0 }));
  }
  if (sumW <= 0) {
    const base = Math.floor(d / eligible.length);
    const rem = d - base * eligible.length;
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
