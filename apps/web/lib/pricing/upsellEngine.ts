import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import {
  bundlesForService,
  type ExtraBundleDef,
  isExtraAllowedForService,
} from "@/lib/pricing/extrasConfig";

export type UpsellContextInput = Pick<
  BookingStep1State,
  "service" | "rooms" | "extraRooms" | "extras"
>;

const HEAVY_SERVICES = new Set<string>(["deep", "move", "carpet"]);

/**
 * Contextual add-on ids (engine keys) for light-touch recommendations.
 */
export function getRecommendedExtraIds(input: UpsellContextInput): string[] {
  const svc = input.service;
  if (!svc) return [];
  const out: string[] = [];
  const push = (id: string) => {
    if (!input.extras.includes(id) && isExtraAllowedForService(id, svc)) out.push(id);
  };

  if (HEAVY_SERVICES.has(svc)) {
    push("mattress-cleaning");
    push("carpet-cleaning");
    push("balcony-cleaning");
    return [...new Set(out)];
  }

  if (svc === "airbnb") {
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
  if (svc === "move") {
    push("interior-windows");
    push("garage-cleaning");
  }

  return [...new Set(out)];
}

/** Primary bundle to reinforce in schedule/checkout for this job shape. */
export function getPrimaryBundleForContext(input: UpsellContextInput): ExtraBundleDef | null {
  const s = input.service;
  if (!s) return null;
  const list = bundlesForService(s);
  if (list.length === 0) return null;

  if (HEAVY_SERVICES.has(s)) {
    return (
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
