import type { WidgetOptionalExtraId } from "@/lib/pricing/calculatePrice";
import { WIDGET_OPTIONAL_EXTRA_PRICES } from "@/lib/pricing/calculatePrice";

export type BookingOptionalExtraCategoryId = "kitchen" | "living" | "laundry" | "special";

export const BOOKING_OPTIONAL_EXTRA_CATEGORY_LABEL: Record<BookingOptionalExtraCategoryId, string> = {
  kitchen: "Kitchen",
  living: "Living areas",
  laundry: "Laundry",
  special: "Special services",
};

export type BookingOptionalExtraIconKey =
  | "fridge"
  | "oven"
  | "cabinets"
  | "windows"
  | "walls"
  | "plants";

export type BookingOptionalExtraDef = {
  id: WidgetOptionalExtraId;
  name: string;
  description: string;
  /** ZAR — must match `WIDGET_OPTIONAL_EXTRA_PRICES[id]`. */
  price: number;
  /** Extra time on site (for display only). */
  durationHours: number;
  category: BookingOptionalExtraCategoryId;
  popular?: boolean;
  iconKey: BookingOptionalExtraIconKey;
};

/**
 * Homepage widget + conversion step optional add-ons (up to six).
 * Prices come from `WIDGET_OPTIONAL_EXTRA_PRICES` (single source of truth for quotes).
 */
export const BOOKING_OPTIONAL_EXTRAS_CATALOG: readonly BookingOptionalExtraDef[] = [
  {
    id: "fridge",
    name: "Inside Fridge",
    description: "",
    durationHours: 0.5,
    category: "kitchen",
    popular: true,
    iconKey: "fridge",
    price: WIDGET_OPTIONAL_EXTRA_PRICES.fridge,
  },
  {
    id: "oven",
    name: "Inside Oven",
    description: "",
    durationHours: 0.75,
    category: "kitchen",
    iconKey: "oven",
    price: WIDGET_OPTIONAL_EXTRA_PRICES.oven,
  },
  {
    id: "cabinets",
    name: "Inside Cabinets",
    description: "",
    durationHours: 0.5,
    category: "kitchen",
    iconKey: "cabinets",
    price: WIDGET_OPTIONAL_EXTRA_PRICES.cabinets,
  },
  {
    id: "windows",
    name: "Interior Windows",
    description: "",
    durationHours: 0.75,
    category: "living",
    iconKey: "windows",
    price: WIDGET_OPTIONAL_EXTRA_PRICES.windows,
  },
  {
    id: "walls",
    name: "Interior Walls",
    description: "",
    durationHours: 1,
    category: "living",
    iconKey: "walls",
    price: WIDGET_OPTIONAL_EXTRA_PRICES.walls,
  },
  {
    id: "plants",
    name: "Water Plants",
    description: "",
    durationHours: 0.25,
    category: "living",
    iconKey: "plants",
    price: WIDGET_OPTIONAL_EXTRA_PRICES.plants,
  },
] satisfies readonly BookingOptionalExtraDef[];

const CATEGORY_ORDER: BookingOptionalExtraCategoryId[] = ["kitchen", "living", "laundry", "special"];

export function extrasGroupedByCategory(): { category: BookingOptionalExtraCategoryId; items: BookingOptionalExtraDef[] }[] {
  const map = new Map<BookingOptionalExtraCategoryId, BookingOptionalExtraDef[]>();
  for (const ex of BOOKING_OPTIONAL_EXTRAS_CATALOG) {
    const list = map.get(ex.category) ?? [];
    list.push(ex);
    map.set(ex.category, list);
  }
  return CATEGORY_ORDER.filter((c) => (map.get(c)?.length ?? 0) > 0).map((category) => ({
    category,
    items: map.get(category)!,
  }));
}
