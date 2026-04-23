import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRICING_ENGINE_ALGORITHM_VERSION } from "@/lib/pricing/engineVersion";
import type { PricingRatesSnapshot, SnapshotBundleRow } from "@/lib/pricing/pricingRatesSnapshot";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";

const SERVICE_KEYS: readonly BookingServiceId[] = [
  "quick",
  "standard",
  "airbnb",
  "deep",
  "carpet",
  "move",
];

function serviceTypeToServiceIds(st: string): BookingServiceId[] {
  const s = st.trim().toLowerCase();
  if (s === "light") return ["quick", "standard", "airbnb"];
  if (s === "heavy") return ["deep", "move", "carpet"];
  return ["quick", "standard", "airbnb", "deep", "carpet", "move"];
}

function scopeToBundleServices(scope: string): BookingServiceId[] | undefined {
  const s = scope.trim().toLowerCase();
  if (s === "light") return ["quick", "standard", "airbnb"];
  if (s === "heavy") return ["deep", "move", "carpet"];
  return undefined;
}

function rowToTariff(row: {
  base_price: number;
  price_per_bedroom: number;
  price_per_bathroom: number;
  price_per_extra_room: number;
  duration_base: number;
  duration_per_bedroom: number;
  duration_per_bathroom: number;
  duration_per_extra_room: number;
}): ServiceTariff {
  return {
    base: Math.round(Number(row.base_price) || 0),
    bedroom: Math.round(Number(row.price_per_bedroom) || 0),
    bathroom: Math.round(Number(row.price_per_bathroom) || 0),
    extraRoom: Math.round(Number(row.price_per_extra_room) || 0),
    duration: {
      base: Number(row.duration_base) || 0,
      bedroom: Number(row.duration_per_bedroom) || 0,
      bathroom: Number(row.duration_per_bathroom) || 0,
      extraRoom: Number(row.duration_per_extra_room) || 0,
    },
  };
}

/**
 * Builds the canonical {@link PricingRatesSnapshot} from live `pricing_*` tables (admin source of truth).
 */
export async function buildPricingRatesSnapshotFromDb(supabase: SupabaseClient): Promise<PricingRatesSnapshot | null> {
  const { data: svcRows, error: svcErr } = await supabase
    .from("pricing_services")
    .select(
      "slug, base_price, price_per_bedroom, price_per_bathroom, price_per_extra_room, duration_base, duration_per_bedroom, duration_per_bathroom, duration_per_extra_room",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (svcErr) {
    console.error("[pricing] pricing_services:", svcErr.message);
    return null;
  }

  const services = {} as Record<BookingServiceId, ServiceTariff>;
  const bySlug: Record<string, ServiceTariff> = {};
  for (const raw of svcRows ?? []) {
    const row = raw as Record<string, unknown>;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!slug) continue;
    bySlug[slug] = rowToTariff({
      base_price: Number(row.base_price),
      price_per_bedroom: Number(row.price_per_bedroom),
      price_per_bathroom: Number(row.price_per_bathroom),
      price_per_extra_room: Number(row.price_per_extra_room),
      duration_base: Number(row.duration_base),
      duration_per_bedroom: Number(row.duration_per_bedroom),
      duration_per_bathroom: Number(row.duration_per_bathroom),
      duration_per_extra_room: Number(row.duration_per_extra_room),
    });
  }

  const fallback = rowToTariff({
    base_price: 0,
    price_per_bedroom: 0,
    price_per_bathroom: 0,
    price_per_extra_room: 0,
    duration_base: 3.5,
    duration_per_bedroom: 0.5,
    duration_per_bathroom: 0.5,
    duration_per_extra_room: 0.3,
  });
  const baseTariff = bySlug.standard ?? bySlug[Object.keys(bySlug)[0] ?? ""] ?? fallback;
  for (const k of SERVICE_KEYS) {
    services[k] = bySlug[k] ?? baseTariff;
  }

  const { data: extRows, error: extErr } = await supabase
    .from("pricing_extras")
    .select("slug, price, service_type, name, description, is_popular")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (extErr) {
    console.error("[pricing] pricing_extras:", extErr.message);
    return null;
  }

  const extras: PricingRatesSnapshot["extras"] = {};
  for (const raw of extRows ?? []) {
    const row = raw as Record<string, unknown>;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!slug) continue;
    const price = Math.round(Number(row.price) || 0);
    const st = typeof row.service_type === "string" ? row.service_type : "all";
    const name = typeof row.name === "string" ? row.name : undefined;
    const description = typeof row.description === "string" ? row.description : undefined;
    extras[slug] = {
      price,
      services: serviceTypeToServiceIds(st),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(row.is_popular === true ? { isPopular: true as const } : {}),
    };
  }

  const { data: bundleRows, error: bErr } = await supabase
    .from("pricing_extra_bundles")
    .select("bundle_id, label, blurb, bundle_price, items, service_scope")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (bErr) {
    console.error("[pricing] pricing_extra_bundles:", bErr.message);
    return null;
  }

  const bundles: SnapshotBundleRow[] = [];
  for (const raw of bundleRows ?? []) {
    const row = raw as Record<string, unknown>;
    const id = typeof row.bundle_id === "string" ? row.bundle_id.trim() : "";
    const price = Math.round(Number(row.bundle_price) || 0);
    const items = Array.isArray(row.items)
      ? row.items.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
      : [];
    const scope = typeof row.service_scope === "string" ? row.service_scope : "light";
    if (!id || !Number.isFinite(price) || items.length === 0) continue;
    const svc = scopeToBundleServices(scope);
    const label = typeof row.label === "string" ? row.label : id;
    const blurb = typeof row.blurb === "string" ? row.blurb : "";
    bundles.push({ id, items, price, services: svc, label, blurb });
  }

  return {
    codeVersion: PRICING_ENGINE_ALGORITHM_VERSION,
    services,
    extras,
    bundles,
  };
}
