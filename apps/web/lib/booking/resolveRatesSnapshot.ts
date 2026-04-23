import "server-only";

import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPricingRatesSnapshotByVersionId } from "@/lib/booking/pricingVersionDb";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Frozen catalog from `pricing_versions` when the lock references a row; otherwise the current DB catalog.
 */
export async function resolveRatesSnapshotForLockedBooking(
  supabase: SupabaseClient,
  locked: { pricing_version_id?: string | null },
): Promise<PricingRatesSnapshot | null> {
  const id = typeof locked.pricing_version_id === "string" ? locked.pricing_version_id.trim() : "";
  if (id && isUuid(id)) {
    const frozen = await fetchPricingRatesSnapshotByVersionId(supabase, id);
    if (frozen) return frozen;
  }
  return buildPricingRatesSnapshotFromDb(supabase);
}
