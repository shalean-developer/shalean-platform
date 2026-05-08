import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import {
  bundlesForServiceFromSnapshot,
  isExtraAllowedForService,
  type ExtraBundleDef,
} from "@/lib/pricing/extrasConfig";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

export type UpsellContextInput = Pick<
  BookingStep1State,
  "service" | "rooms" | "bathrooms" | "extraRooms" | "extras" | "serviceAreaName" | "propertyType"
> & {
  pastBookings?: { extras?: string[] }[];
};

const HEAVY_SERVICES = new Set<string>(["deep", "move", "carpet"]);
const AIRBNB_AREAS = ["sea point", "green point", "camps bay", "bantry bay", "waterfront", "de waterkant"];
const FAMILY_HOME_AREAS = ["constantia", "newlands", "durbanville", "claremont", "rondebosch"];

/**
 * Contextual add-on ids (engine keys) for light-touch recommendations.
 */
export function getRecommendedExtraIds(input: UpsellContextInput, snapshot: PricingRatesSnapshot): string[] {
  const svc = input.service;
  if (!svc) return [];
  const out: string[] = [];
  const push = (id: string) => {
    if (!input.extras.includes(id) && isExtraAllowedForService(id, svc, snapshot)) out.push(id);
  };

  if (HEAVY_SERVICES.has(svc)) {
    if (svc === "move") {
      push("inside-oven");
      push("inside-cabinets");
      push("interior-walls");
      push("inside-fridge");
    }
    if (svc === "deep") {
      push("inside-oven");
      push("interior-walls");
      push("inside-cabinets");
    }
    push("mattress-cleaning");
    push("carpet-cleaning");
    push("balcony-cleaning");
  }

  if (svc === "airbnb") {
    push("inside-fridge");
    push("laundry");
    push("ironing");
    push("interior-windows");
    push("inside-oven");
  }
  if (svc === "standard") {
    push("inside-fridge");
    push("inside-cabinets");
  }
  if (svc === "quick") {
    push("inside-fridge");
    push("laundry");
  }
  if (input.rooms >= 3) {
    push("inside-cabinets");
  }
  if (input.extraRooms > 0) {
    push("inside-cabinets");
  }
  if ((input.bathrooms ?? 0) >= 2) {
    push("interior-walls");
  }
  const suburb = input.serviceAreaName.trim().toLowerCase();
  if (AIRBNB_AREAS.some((area) => suburb.includes(area))) {
    push("laundry");
    push("inside-fridge");
    push("interior-windows");
  }
  if (FAMILY_HOME_AREAS.some((area) => suburb.includes(area)) || input.propertyType === "house") {
    push("inside-cabinets");
    push("interior-walls");
  }
  for (const id of input.pastBookings?.flatMap((booking) => booking.extras ?? []) ?? []) {
    push(id);
  }
  if (svc === "move") {
    push("interior-windows");
    push("garage-cleaning");
  }

  return [...new Set(out)];
}

/** Primary bundle to reinforce in schedule/checkout for this job shape. */
export function getPrimaryBundleForContext(
  input: UpsellContextInput,
  snapshot: PricingRatesSnapshot,
): ExtraBundleDef | null {
  const s = input.service;
  if (!s) return null;
  const list = bundlesForServiceFromSnapshot(snapshot, s);
  if (list.length === 0) return null;

  if (HEAVY_SERVICES.has(s)) {
    return (
      list.find((b) => b.id === "move_out_package" && s === "move") ??
      list.find((b) => b.id === "deep_refresh_bundle") ?? list.find((b) => b.id === "outdoor_bundle") ?? null
    );
  }

  if (s === "airbnb") {
    return list.find((b) => b.id === "full_home") ?? null;
  }
  if (input.rooms >= 4) {
    return list.find((b) => b.id === "full_home") ?? list.find((b) => b.id === "kitchen") ?? null;
  }
  return list.find((b) => b.id === "kitchen") ?? null;
}

export function bundleFullySelected(bundle: ExtraBundleDef, extras: readonly string[]): boolean {
  return bundle.items.every((id) => extras.includes(id));
}
