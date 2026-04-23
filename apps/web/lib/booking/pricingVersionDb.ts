import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePricingRatesSnapshotFromDbRow, stableStringify, type PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

function hashConfig(snapshot: PricingRatesSnapshot): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

/**
 * Inserts or returns an existing `pricing_versions` row for this catalog snapshot (deduped by hash).
 */
export async function getOrCreatePricingVersionId(
  supabase: SupabaseClient,
  snapshot: PricingRatesSnapshot,
): Promise<{ id: string; snapshot: PricingRatesSnapshot } | null> {
  const snap = snapshot;
  const config_hash = hashConfig(snap);

  const { data: existing, error: selErr } = await supabase
    .from("pricing_versions")
    .select("id")
    .eq("config_hash", config_hash)
    .maybeSingle();

  if (selErr) {
    console.error("[pricing_versions] select:", selErr.message);
    return null;
  }
  if (existing && typeof existing === "object" && "id" in existing) {
    return { id: String((existing as { id: string }).id), snapshot: snap };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("pricing_versions")
    .insert({
      code_version: snap.codeVersion,
      services: snap.services,
      extras: snap.extras,
      rules: { bundles: snap.bundles },
      config_hash,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.code === "23505") {
      const { data: again } = await supabase.from("pricing_versions").select("id").eq("config_hash", config_hash).maybeSingle();
      if (again && typeof again === "object" && "id" in again) {
        return { id: String((again as { id: string }).id), snapshot: snap };
      }
    }
    console.error("[pricing_versions] insert:", insErr.message);
    return null;
  }

  if (inserted && typeof inserted === "object" && "id" in inserted) {
    return { id: String((inserted as { id: string }).id), snapshot: snap };
  }
  return null;
}

export async function fetchPricingRatesSnapshotByVersionId(
  supabase: SupabaseClient,
  versionId: string,
): Promise<PricingRatesSnapshot | null> {
  const id = versionId.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("pricing_versions")
    .select("code_version, services, extras, rules")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[pricing_versions] fetch:", error.message);
    return null;
  }
  return parsePricingRatesSnapshotFromDbRow({
    code_version: (data as { code_version?: number }).code_version ?? NaN,
    services: (data as { services?: unknown }).services,
    extras: (data as { extras?: unknown }).extras,
    rules: (data as { rules?: unknown }).rules ?? {},
  });
}
