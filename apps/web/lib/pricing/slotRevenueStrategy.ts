/**
 * Slot ordering + conversion labels (client + server safe).
 * ZAR amounts come from `quoteCheckoutZar`; this layer only ranks and badges.
 */

export type SlotPickInput = {
  time: string;
  price: number;
  cleanersCount: number;
};

/** Single “balanced” pick: price near day average + healthier cleaner pool. */
export function pickRecommendedSlot(slots: SlotPickInput[]): string | null {
  const priced = slots.filter((s) => s.price > 0 && Number.isFinite(s.price));
  if (!priced.length) return null;
  const avg = priced.reduce((a, s) => a + s.price, 0) / priced.length;
  let pool = priced.filter((s) => s.cleanersCount >= 3);
  if (!pool.length) pool = priced.filter((s) => s.cleanersCount >= 2);
  if (!pool.length) pool = [...priced];
  pool.sort((a, b) => {
    const da = Math.abs(a.price - avg);
    const db = Math.abs(b.price - avg);
    if (da !== db) return da - db;
    return b.cleanersCount - a.cleanersCount;
  });
  return pool[0]!.time;
}

export function minSlotPrice(slots: SlotPickInput[]): number {
  if (!slots.length) return 0;
  return Math.min(...slots.map((s) => s.price));
}

/**
 * Display order: recommended first, then other “best value” (min price) times, then by clock time.
 */
export function orderSlotTimesForDisplay(slots: SlotPickInput[], recommendedTime: string | null): string[] {
  const uniqueTimes = [...new Set(slots.map((s) => s.time))];
  const minP = minSlotPrice(slots);
  const best = new Set(slots.filter((s) => s.price === minP && minP > 0).map((s) => s.time));

  function rank(t: string): number {
    if (recommendedTime && t === recommendedTime) return 0;
    if (best.has(t)) return 1;
    return 2;
  }

  return uniqueTimes.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

export type SlotStrategyBadge = "recommended" | "best-value" | "filling-fast";

/** Strict priority: only one Recommended; Best value = at min price; Filling fast when supply is thin. */
export function slotStrategyBadge(
  time: string,
  recommendedTime: string | null,
  minPrice: number,
  slot: SlotPickInput | undefined,
): SlotStrategyBadge | null {
  if (!slot || !Number.isFinite(slot.price) || slot.price <= 0) return null;
  if (recommendedTime && time === recommendedTime) return "recommended";
  if (minPrice > 0 && slot.price === minPrice) return "best-value";
  if (slot.cleanersCount <= 2) return "filling-fast";
  return null;
}
