import { clampMultiplier } from "@/lib/ai/pricingOptimizer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Loads per-slot AI multipliers (defaults to empty → caller uses 1). */
export async function fetchSlotAdjustmentMap(): Promise<Record<string, number>> {
  const admin = getSupabaseAdmin();
  if (!admin) return {};

  const { data, error } = await admin.from("pricing_slot_adjustments").select("slot_time, multiplier");
  if (error || !data?.length) return {};

  const map: Record<string, number> = {};
  for (const row of data) {
    const st = row && typeof row === "object" && "slot_time" in row ? String((row as { slot_time?: string }).slot_time) : "";
    const m = row && typeof row === "object" && "multiplier" in row ? Number((row as { multiplier?: unknown }).multiplier) : NaN;
    if (st && /^\d{2}:\d{2}$/.test(st) && Number.isFinite(m)) {
      map[st] = clampMultiplier(m);
    }
  }
  return map;
}
