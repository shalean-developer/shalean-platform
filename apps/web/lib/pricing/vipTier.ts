/** Stored on `user_profiles.tier` and embedded in locked booking snapshots for checkout validation. */
export type VipTier = "regular" | "silver" | "gold" | "platinum";

export const VIP_DISCOUNTS: Record<VipTier, number> = {
  regular: 0,
  silver: 0.05,
  gold: 0.1,
  platinum: 0.15,
};

export function normalizeVipTier(raw: string | null | undefined): VipTier {
  const t = (raw ?? "regular").toLowerCase();
  if (t === "silver" || t === "gold" || t === "platinum") return t;
  return "regular";
}

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
