import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  defaultEquipmentPricingConfig,
  parseEquipmentPricingConfig,
  type EquipmentPricingConfig,
} from "@/lib/booking-v2/equipmentPricing";

export async function loadEquipmentPricingConfig(): Promise<EquipmentPricingConfig> {
  const admin = getSupabaseAdmin();
  if (!admin) return defaultEquipmentPricingConfig();

  const { data } = await admin
    .from("pricing_booking_config")
    .select("config")
    .eq("id", "default")
    .maybeSingle();

  const configJson = data?.config;
  if (!configJson || typeof configJson !== "object") {
    return defaultEquipmentPricingConfig();
  }

  return parseEquipmentPricingConfig((configJson as Record<string, unknown>).equipment_pricing);
}
