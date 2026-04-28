/**
 * Extras UX helpers — ZAR and eligibility come from {@link PricingRatesSnapshot} (Supabase catalog).
 */
import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { PricingRatesSnapshot, SnapshotBundleRow } from "@/lib/pricing/pricingRatesSnapshot";
import {
  computeBundledExtrasTotalZarSnapshot,
  filterExtrasForSnapshot,
  isExtraAllowedInSnapshot,
} from "@/lib/pricing/pricingEngineSnapshot";

const LIGHT: readonly BookingServiceId[] = ["quick", "standard", "airbnb"];
const HEAVY: readonly BookingServiceId[] = ["deep", "move", "carpet"];

/** Known extra slugs (align with `pricing_extras.slug`). */
export const BOOKING_EXTRA_ID_SET = new Set<string>([
  "inside-cabinets",
  "inside-oven",
  "inside-fridge",
  "interior-walls",
  "ironing",
  "laundry",
  "interior-windows",
  "water-plants",
  "balcony-cleaning",
  "carpet-cleaning",
  "ceiling-cleaning",
  "garage-cleaning",
  "mattress-cleaning",
  "outside-windows",
  "extra-cleaner",
  "supplies-kit",
]);

export type ExtraBundleDef = SnapshotBundleRow;

export function bundlesForServiceFromSnapshot(
  snapshot: PricingRatesSnapshot,
  service: BookingServiceId | null,
): SnapshotBundleRow[] {
  if (!service) return [];
  return snapshot.bundles.filter((b) => {
    if (b.services && !b.services.includes(service)) return false;
    return b.items.every((id) => isExtraAllowedInSnapshot(snapshot, id, service));
  });
}

export function bundleRetailSumZar(snapshot: PricingRatesSnapshot, bundle: SnapshotBundleRow): number {
  return bundle.items.reduce((s, id) => s + (snapshot.extras[id]?.price ?? 0), 0);
}

export function bundleSavingsZar(
  snapshot: PricingRatesSnapshot,
  bundle: SnapshotBundleRow,
  service: BookingServiceId | null,
): number {
  if (!service) return 0;
  if (bundle.services && !bundle.services.includes(service)) return 0;
  if (!bundle.items.every((id) => isExtraAllowedInSnapshot(snapshot, id, service))) return 0;
  return Math.max(0, Math.round(bundleRetailSumZar(snapshot, bundle) - bundle.price));
}

export { computeBundledExtrasTotalZarSnapshot };

export function bookingExtrasTier(service: BookingServiceId | null): "light" | "heavy" | "none" {
  if (!service) return "none";
  if ((LIGHT as readonly string[]).includes(service)) return "light";
  if ((HEAVY as readonly string[]).includes(service)) return "heavy";
  return "none";
}

export function isExtraAllowedForService(
  extraId: string,
  service: BookingServiceId | null,
  snapshot: PricingRatesSnapshot,
): boolean {
  return isExtraAllowedInSnapshot(snapshot, extraId, service);
}

export function filterExtrasForService(
  extraIds: readonly string[],
  service: BookingServiceId | null,
  snapshot: PricingRatesSnapshot,
): string[] {
  return filterExtrasForSnapshot(snapshot, extraIds, service);
}

export type ExtraLineItem = { slug: string; name: string; price: number };

export function extrasLineItemsForService(
  slugs: readonly string[],
  service: BookingServiceId | null,
  snapshot: PricingRatesSnapshot,
): ExtraLineItem[] {
  return extrasLineItemsFromSnapshot(snapshot, slugs, service);
}

export function extrasLineItemsFromSnapshot(
  snapshot: PricingRatesSnapshot,
  slugs: readonly string[],
  service: BookingServiceId | null,
): ExtraLineItem[] {
  const seen = new Set<string>();
  const out: ExtraLineItem[] = [];
  for (const raw of slugs) {
    const id = String(raw).trim();
    if (!id || seen.has(id)) continue;
    if (!isExtraAllowedInSnapshot(snapshot, id, service)) continue;
    const row = snapshot.extras[id];
    if (!row) continue;
    seen.add(id);
    out.push({ slug: id, name: row.name ?? id, price: row.price });
  }
  return out;
}

export type ExtrasUiSection = {
  id: string;
  title: string;
  extraIds: readonly string[];
};

/**
 * Grouped chips — `orderedSlugs` should match `GET /api/pricing/catalog` order for the full grid.
 */
export function extrasUISections(
  service: BookingServiceId | null,
  snapshot: PricingRatesSnapshot,
  orderedSlugs: readonly string[],
): ExtrasUiSection[] {
  if (!service) return [];
  const allowed = new Set(orderedSlugs.filter((id) => isExtraAllowedInSnapshot(snapshot, id, service)));
  const pick = (ids: readonly string[]) => ids.filter((id) => allowed.has(id));

  if ((LIGHT as readonly string[]).includes(service)) {
    const sections: ExtrasUiSection[] = [
      {
        id: "light_extras",
        title: "Available add-ons",
        extraIds: pick([
          "inside-oven",
          "inside-fridge",
          "inside-cabinets",
          "interior-walls",
          "ironing",
          "laundry",
          "interior-windows",
          "water-plants",
          "extra-cleaner",
          "supplies-kit",
        ]),
      },
    ];
    return sections.filter((s) => s.extraIds.length > 0);
  }

  if ((HEAVY as readonly string[]).includes(service)) {
    const sections: ExtrasUiSection[] = [
      {
        id: "heavy_extras",
        title: "Available add-ons",
        extraIds: pick([
          "carpet-cleaning",
          "mattress-cleaning",
          "ceiling-cleaning",
          "balcony-cleaning",
          "garage-cleaning",
          "outside-windows",
          "extra-cleaner",
          "supplies-kit",
        ]),
      },
    ];
    return sections.filter((s) => s.extraIds.length > 0);
  }

  return [];
}

export function extrasDisplayOrderResolved(orderedSlugs: readonly string[]): string[] {
  return [...orderedSlugs];
}

export function mostPopularExtraIdFromSnapshot(
  snapshot: PricingRatesSnapshot,
  service: BookingServiceId | null,
): string | null {
  if (!service) return null;
  for (const slug of Object.keys(snapshot.extras)) {
    const row = snapshot.extras[slug];
    if (!row?.isPopular) continue;
    if (!isExtraAllowedInSnapshot(snapshot, slug, service)) continue;
    return slug;
  }
  return null;
}

export function computeExtrasRetailSumZar(
  snapshot: PricingRatesSnapshot,
  extraIds: readonly string[],
  service: BookingServiceId | null,
): number {
  const valid = filterExtrasForSnapshot(snapshot, extraIds, service);
  let s = 0;
  for (const id of valid) {
    s += snapshot.extras[id]?.price ?? 0;
  }
  return s;
}

export function computeExtrasBundleSavingsZar(
  snapshot: PricingRatesSnapshot,
  extraIds: readonly string[],
  service: BookingServiceId | null,
): number {
  const retail = computeExtrasRetailSumZar(snapshot, extraIds, service);
  const bundled = computeBundledExtrasTotalZarSnapshot(snapshot, extraIds, service);
  return Math.max(0, Math.round(retail - bundled));
}
