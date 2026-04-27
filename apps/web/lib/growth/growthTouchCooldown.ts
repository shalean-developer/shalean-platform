import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const DUMMY_BOOKING_FOR_PRIOR = "00000000-0000-0000-0000-000000000001";

export function growthMessageCooldownHours(): number {
  const raw = Number(process.env.GROWTH_MESSAGE_COOLDOWN_HOURS ?? "72");
  return Number.isFinite(raw) ? Math.min(168, Math.max(12, Math.round(raw))) : 72;
}

export function growthMaxDiscountTouchesPerMonth(): number {
  const raw = Number(process.env.GROWTH_MAX_DISCOUNT_TOUCHES_PER_MONTH ?? "2");
  return Number.isFinite(raw) ? Math.min(10, Math.max(0, Math.round(raw))) : 2;
}

export async function countGrowthTouchesSince(
  admin: SupabaseClient,
  userId: string,
  touchTypes: string[],
  sinceIso: string,
): Promise<number> {
  if (!touchTypes.length) return 0;
  const { count, error } = await admin
    .from("growth_customer_touch")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("touch_type", touchTypes)
    .gte("created_at", sinceIso);
  if (error) return 0;
  return count ?? 0;
}

export async function hasGrowthCooldown(
  admin: SupabaseClient,
  userId: string,
  touchType: string,
): Promise<boolean> {
  const hours = growthMessageCooldownHours();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const n = await countGrowthTouchesSince(admin, userId, [touchType], since);
  return n > 0;
}

export async function insertGrowthTouch(
  admin: SupabaseClient,
  row: { user_id: string; touch_type: string; channel: "email" | "sms" },
): Promise<void> {
  await admin.from("growth_customer_touch").insert(row);
}

export async function discountBudgetOk(admin: SupabaseClient, userId: string): Promise<boolean> {
  const max = growthMaxDiscountTouchesPerMonth();
  if (max <= 0) return false;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const n = await countGrowthTouchesSince(admin, userId, ["win_back", "ltv_discount"], since);
  return n < max;
}

export { DUMMY_BOOKING_FOR_PRIOR };
