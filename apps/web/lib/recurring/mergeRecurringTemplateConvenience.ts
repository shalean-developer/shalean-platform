import "server-only";

import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { normalizeVisitTimeHm } from "@/lib/recurring/buildAdminRecurringQuickSnapshot";

function serviceMeta(service: BookingServiceId): {
  service: BookingServiceId;
  service_group: "regular" | "specialised";
  selectedCategory: "regular" | "specialised";
  service_type:
    | "standard_cleaning"
    | "deep_cleaning"
    | "move_cleaning"
    | "airbnb_cleaning"
    | "carpet_cleaning";
} {
  if (service === "deep") {
    return {
      service: "deep",
      service_group: "specialised",
      selectedCategory: "specialised",
      service_type: "deep_cleaning",
    };
  }
  if (service === "move") {
    return {
      service: "move",
      service_group: "specialised",
      selectedCategory: "specialised",
      service_type: "move_cleaning",
    };
  }
  return {
    service: "standard",
    service_group: "regular",
    selectedCategory: "regular",
    service_type: "standard_cleaning",
  };
}

export type RecurringTemplateConvenienceUpdate = {
  address?: string;
  visit_time?: string;
  service?: BookingServiceId;
  price?: number;
};

/**
 * Patch visit template fields used by the recurring generator (address, time, service, price).
 */
export function mergeRecurringTemplateConvenience(
  template: unknown,
  updates: RecurringTemplateConvenienceUpdate,
): unknown | null {
  if (!template || typeof template !== "object" || Array.isArray(template)) return null;

  const t = structuredClone(template) as Record<string, unknown>;
  const locked =
    t.locked && typeof t.locked === "object" && !Array.isArray(t.locked)
      ? (t.locked as Record<string, unknown>)
      : null;
  if (!locked) return null;

  if (updates.address) {
    const loc = updates.address.trim().slice(0, 500);
    locked.location = loc;
    if (t.flat && typeof t.flat === "object" && !Array.isArray(t.flat)) {
      (t.flat as Record<string, unknown>).location = loc;
    }
  }

  if (updates.visit_time) {
    const hm = normalizeVisitTimeHm(updates.visit_time);
    locked.time = hm;
    if (t.flat && typeof t.flat === "object" && !Array.isArray(t.flat)) {
      (t.flat as Record<string, unknown>).time = hm;
    }
  }

  if (updates.service) {
    Object.assign(locked, serviceMeta(updates.service));
  }

  if (updates.price != null && Number.isFinite(updates.price)) {
    const p = Math.max(1, Math.round(updates.price));
    locked.finalPrice = p;
    t.total_zar = p;
    if (typeof t.visit_total_zar === "number") t.visit_total_zar = p;
  }

  t.locked = locked;
  return t;
}
