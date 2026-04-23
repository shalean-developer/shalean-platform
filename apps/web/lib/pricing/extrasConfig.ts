/**
 * Add-on catalog: ZAR, labels, and **which booking services** may bill each extra.
 * Bundles apply only when every item is allowed for the job service.
 */
import type { BookingServiceId } from "@/components/booking/serviceCategories";

export type ExtraCatalogEntry = {
  price: number;
  label: string;
  /** Services that may include this extra in quotes, locks, and checkout. */
  services: readonly BookingServiceId[];
};

const LIGHT: readonly BookingServiceId[] = ["quick", "standard", "airbnb"];
const HEAVY: readonly BookingServiceId[] = ["deep", "move", "carpet"];
const ALL: readonly BookingServiceId[] = ["quick", "standard", "airbnb", "deep", "carpet", "move"];

/** Canonical ids — must match `bookings.extras` / step-1 storage. */
export const EXTRAS_CATALOG: Record<string, ExtraCatalogEntry> = {
  "inside-cabinets": { price: 39, label: "Inside cabinets", services: ["standard", "airbnb"] },
  "inside-oven": { price: 59, label: "Inside oven", services: ["standard", "airbnb"] },
  "inside-fridge": { price: 39, label: "Inside fridge", services: ["quick", "standard", "airbnb"] },
  "interior-walls": { price: 59, label: "Interior walls", services: ["standard", "airbnb"] },
  ironing: { price: 49, label: "Ironing", services: ["standard", "airbnb"] },
  laundry: { price: 49, label: "Laundry", services: ["quick", "standard", "airbnb"] },
  "interior-windows": { price: 59, label: "Interior windows", services: ["quick", "standard", "airbnb"] },
  "water-plants": { price: 25, label: "Water plants", services: ["quick", "standard", "airbnb"] },

  "balcony-cleaning": { price: 249, label: "Balcony cleaning", services: HEAVY },
  "carpet-cleaning": { price: 349, label: "Carpet cleaning", services: HEAVY },
  "ceiling-cleaning": { price: 199, label: "Ceiling cleaning", services: HEAVY },
  "garage-cleaning": { price: 199, label: "Garage cleaning", services: HEAVY },
  "mattress-cleaning": { price: 349, label: "Mattress cleaning", services: HEAVY },
  "outside-windows": { price: 249, label: "Outside windows", services: HEAVY },

  "extra-cleaner": { price: 299, label: "Extra cleaner", services: ALL },
  "supplies-kit": { price: 399, label: "Supplies kit", services: ALL },
};

/** Persisted step-1 extras must be catalog ids (unknown strings are dropped on read). */
export const BOOKING_EXTRA_ID_SET: ReadonlySet<string> = new Set(Object.keys(EXTRAS_CATALOG));

/** Flat map for widgets / legacy imports — prices only. */
export const EXTRAS_ZAR: Record<string, number> = Object.fromEntries(
  Object.entries(EXTRAS_CATALOG).map(([k, v]) => [k, v.price]),
);

/**
 * Preferred flat sort order for legacy UIs (`ExtrasSection` fallbacks, widgets).
 * **Ids are kebab-case** and must match keys in {@link EXTRAS_CATALOG} (not underscore aliases).
 */
export const EXTRAS_DISPLAY_ORDER = [
  "inside-oven",
  "inside-fridge",
  "inside-cabinets",
  "interior-walls",
  "ironing",
  "laundry",
  "interior-windows",
  "water-plants",
  "carpet-cleaning",
  "mattress-cleaning",
  "ceiling-cleaning",
  "garage-cleaning",
  "balcony-cleaning",
  "outside-windows",
  "extra-cleaner",
  "supplies-kit",
] as const satisfies readonly (keyof typeof EXTRAS_CATALOG)[];

/** Safe ordered ids: known order intersected with catalog, else all catalog keys. */
export function extrasDisplayOrderResolved(): string[] {
  const ordered = (EXTRAS_DISPLAY_ORDER as readonly string[]).filter((id) => id in EXTRAS_CATALOG);
  if (ordered.length > 0) return [...ordered];
  return Object.keys(EXTRAS_CATALOG);
}

export function isExtraAllowedForService(extraId: string, service: BookingServiceId | null): boolean {
  if (!service) return false;
  const row = EXTRAS_CATALOG[extraId];
  if (!row) return false;
  return (row.services as readonly BookingServiceId[]).includes(service);
}

export function filterExtrasForService(
  extraIds: readonly string[],
  service: BookingServiceId | null,
): string[] {
  return extraIds.filter((id) => isExtraAllowedForService(id, service));
}

export type ExtrasUiSection = {
  id: string;
  title: string;
  extraIds: readonly string[];
};

/** Grouped chips for `ExtrasSection` — ids not allowed for `service` are omitted. */
export function extrasUISections(service: BookingServiceId | null): ExtrasUiSection[] {
  if (!service) return [];
  const allowed = new Set(
    Object.keys(EXTRAS_CATALOG).filter((id) => isExtraAllowedForService(id, service)),
  );
  const pick = (ids: readonly string[]) => ids.filter((id) => allowed.has(id));

  if ((LIGHT as readonly string[]).includes(service)) {
    const sections: ExtrasUiSection[] = [
      {
        id: "kitchen_home",
        title: "Kitchen & home add-ons",
        extraIds: pick(["inside-oven", "inside-fridge", "inside-cabinets", "interior-walls"]),
      },
      {
        id: "care_laundry",
        title: "Care & laundry",
        extraIds: pick(["ironing", "laundry", "interior-windows", "water-plants"]),
      },
      {
        id: "global",
        title: "Team & supplies",
        extraIds: pick(["extra-cleaner", "supplies-kit"]),
      },
    ];
    return sections.filter((s) => s.extraIds.length > 0);
  }

  if ((HEAVY as readonly string[]).includes(service)) {
    const sections: ExtrasUiSection[] = [
      {
        id: "deep_addons",
        title: "Deep cleaning add-ons",
        extraIds: pick(["carpet-cleaning", "mattress-cleaning", "ceiling-cleaning"]),
      },
      {
        id: "outdoor_large",
        title: "Outdoor & large areas",
        extraIds: pick(["balcony-cleaning", "garage-cleaning", "outside-windows"]),
      },
      {
        id: "global",
        title: "Team & supplies",
        extraIds: pick(["extra-cleaner", "supplies-kit"]),
      },
    ];
    return sections.filter((s) => s.extraIds.length > 0);
  }

  return [];
}

/** Analytics: light vs heavy catalog tier. */
export function bookingExtrasTier(service: BookingServiceId | null): "light" | "heavy" | "none" {
  if (!service) return "none";
  if ((LIGHT as readonly string[]).includes(service)) return "light";
  if ((HEAVY as readonly string[]).includes(service)) return "heavy";
  return "none";
}

export type ExtraBundleDef = {
  id: string;
  label: string;
  blurb: string;
  items: string[];
  price: number;
  /** When set, bundle is offered only for these services. */
  services?: readonly BookingServiceId[];
};

export const EXTRA_BUNDLES: ExtraBundleDef[] = [
  {
    id: "kitchen",
    label: "Kitchen deep clean",
    blurb: "Oven + fridge",
    items: ["inside-oven", "inside-fridge"],
    price: 79,
    services: LIGHT,
  },
  {
    id: "full_home",
    label: "Full home refresh",
    blurb: "Windows + cabinets",
    items: ["interior-windows", "inside-cabinets"],
    price: 89,
    services: LIGHT,
  },
  {
    id: "deep_refresh_bundle",
    label: "Deep refresh bundle",
    blurb: "Carpet + mattress",
    items: ["carpet-cleaning", "mattress-cleaning"],
    price: 599,
    services: HEAVY,
  },
  {
    id: "outdoor_bundle",
    label: "Outdoor bundle",
    blurb: "Balcony + outside windows",
    items: ["balcony-cleaning", "outside-windows"],
    price: 449,
    services: HEAVY,
  },
];

function retailForExtra(id: string): number {
  return EXTRAS_CATALOG[id]?.price ?? 0;
}

function bundleAppliesToService(bundle: ExtraBundleDef, service: BookingServiceId | null): boolean {
  if (!service) return false;
  if (bundle.services && !bundle.services.includes(service)) return false;
  return bundle.items.every((id) => isExtraAllowedForService(id, service));
}

export function bundlesForService(service: BookingServiceId | null): ExtraBundleDef[] {
  if (!service) return [];
  return EXTRA_BUNDLES.filter((b) => bundleAppliesToService(b, service));
}

export function computeExtrasRetailSumZar(extraIds: readonly string[], service: BookingServiceId | null): number {
  const valid = filterExtrasForService(extraIds, service);
  let s = 0;
  for (const id of valid) {
    s += retailForExtra(id);
  }
  return s;
}

/**
 * Applies non-overlapping bundles greedily (highest savings first), then à la carte for leftovers.
 * Extras not allowed for `service` are ignored (tamper-safe).
 */
export function computeBundledExtrasTotalZar(extraIds: readonly string[], service: BookingServiceId | null): number {
  const valid = filterExtrasForService(extraIds, service);
  const set = new Set(valid.filter((id) => id in EXTRAS_CATALOG));
  if (set.size === 0) return 0;

  const eligibleBundles = bundlesForService(service);

  const bundleSavings = eligibleBundles
    .map((b) => {
      const retail = b.items.reduce((sum, id) => sum + retailForExtra(id), 0);
      return { b, savings: retail - b.price };
    })
    .sort((a, z) => z.savings - a.savings);

  const remaining = new Set(set);
  let total = 0;

  for (const { b } of bundleSavings) {
    if (b.items.every((id) => remaining.has(id))) {
      total += b.price;
      for (const id of b.items) remaining.delete(id);
    }
  }
  for (const id of remaining) {
    total += retailForExtra(id);
  }
  return total;
}

export function computeExtrasBundleSavingsZar(extraIds: readonly string[], service: BookingServiceId | null): number {
  const retail = computeExtrasRetailSumZar(extraIds, service);
  const bundled = computeBundledExtrasTotalZar(extraIds, service);
  return Math.max(0, Math.round(retail - bundled));
}

export function bundleRetailSumZar(bundle: ExtraBundleDef): number {
  return bundle.items.reduce((s, id) => s + retailForExtra(id), 0);
}

export function bundleSavingsZar(bundle: ExtraBundleDef, service: BookingServiceId | null): number {
  if (!bundleAppliesToService(bundle, service)) return 0;
  return Math.max(0, bundleRetailSumZar(bundle) - bundle.price);
}
