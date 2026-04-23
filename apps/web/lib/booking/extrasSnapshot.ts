import type { ExtraLineItem } from "@/lib/pricing/extrasConfig";
import type { BookingServiceId } from "@/components/booking/serviceCategories";

export type LockedExtrasSnapshot = {
  extras: string[];
  extras_line_items?: ExtraLineItem[] | null;
  service: BookingServiceId | null;
};

export function resolveExtrasLineItems(locked: LockedExtrasSnapshot): ExtraLineItem[] {
  if (Array.isArray(locked.extras_line_items) && locked.extras_line_items.length > 0) {
    return locked.extras_line_items;
  }
  return locked.extras
    .map((s) => String(s).trim())
    .filter(Boolean)
    .map((slug) => ({ slug, name: slug, price: 0 }));
}

/** True when slug list matches the frozen line-item snapshot (or can be rebuilt identically). */
export function extrasSnapshotAligned(locked: LockedExtrasSnapshot): boolean {
  const items = resolveExtrasLineItems(locked);
  const slugFromItems = new Set(items.map((i) => i.slug));
  const fromLocked = locked.extras.map((s) => String(s).trim()).filter(Boolean);
  if (fromLocked.length !== slugFromItems.size) return false;
  return fromLocked.every((s) => slugFromItems.has(s));
}
