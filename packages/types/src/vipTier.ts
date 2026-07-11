/** Stored on `user_profiles.tier` and embedded in locked booking snapshots for checkout validation. */
export type VipTier = "regular" | "silver" | "gold" | "platinum";

/** Multiplier on job subtotal before time/demand (1 = no loyalty discount). Single source for `quoteCheckoutZar`. */
const VIP_SUBTOTAL_MULTIPLIER: Record<VipTier, number> = {
  regular: 1,
  silver: 0.95,
  gold: 0.9,
  platinum: 0.85,
};

export function normalizeVipTier(raw: string | VipTier | null | undefined): VipTier {
  const t = (raw == null || raw === "" ? "regular" : String(raw)).toLowerCase();
  if (t === "silver" || t === "gold" || t === "platinum") return t;
  return "regular";
}

/**
 * VIP is applied only inside {@link quoteCheckoutZar} as `subtotal * getVipDiscountMultiplier(tier)`.
 * Do not multiply again at checkout or in UI totals.
 */
export function getVipDiscountMultiplier(tier: VipTier | string | null | undefined): number {
  const t = normalizeVipTier(tier == null || tier === "" ? undefined : typeof tier === "string" ? tier : tier);
  return VIP_SUBTOTAL_MULTIPLIER[t] ?? 1;
}

/** 0–0.15 discount rate for display labels — derived from {@link getVipDiscountMultiplier}. */
export function getVipDiscountRate(tier: VipTier | string | null | undefined): number {
  return 1 - getVipDiscountMultiplier(tier);
}

export const VIP_DISCOUNTS: Record<VipTier, number> = {
  regular: getVipDiscountRate("regular"),
  silver: getVipDiscountRate("silver"),
  gold: getVipDiscountRate("gold"),
  platinum: getVipDiscountRate("platinum"),
};

export function vipDiscountLabel(tier: VipTier): string {
  const d = VIP_DISCOUNTS[tier];
  if (d <= 0) return "";
  return `${Math.round(d * 100)}%`;
}

export function vipTierDisplayName(tier: VipTier): string {
  switch (tier) {
    case "silver":
      return "Silver";
    case "gold":
      return "Gold";
    case "platinum":
      return "Platinum";
    default:
      return "Regular";
  }
}
