import type { WidgetOptionalExtraId } from "@/lib/pricing/calculatePrice";

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
  price: number;
  /** Extra time on site (for display only). */
  durationHours: number;
  category: BookingOptionalExtraCategoryId;
  popular?: boolean;
  iconKey: BookingOptionalExtraIconKey;
};

/**
 * Homepage widget + conversion step optional add-ons (up to six).
 * `prices` comes from {@link getWidgetOptionalExtraPrices} using the same catalog as checkout.
 */
export function buildBookingOptionalExtrasCatalog(
  prices: Record<WidgetOptionalExtraId, number>,
): readonly BookingOptionalExtraDef[] {
  return [
    {
      id: "fridge",
      name: "Inside Fridge",
      description: "",
      durationHours: 0.5,
      category: "kitchen",
      popular: true,
      iconKey: "fridge",
      price: prices.fridge,
    },
    {
      id: "oven",
      name: "Inside Oven",
      description: "",
      durationHours: 0.75,
      category: "kitchen",
      iconKey: "oven",
      price: prices.oven,
    },
    {
      id: "cabinets",
      name: "Inside Cabinets",
      description: "",
      durationHours: 0.5,
      category: "kitchen",
      iconKey: "cabinets",
      price: prices.cabinets,
    },
    {
      id: "windows",
      name: "Interior Windows",
      description: "",
      durationHours: 0.75,
      category: "living",
      iconKey: "windows",
      price: prices.windows,
    },
    {
      id: "walls",
      name: "Interior Walls",
      description: "",
      durationHours: 1,
      category: "living",
      iconKey: "walls",
      price: prices.walls,
    },
    {
      id: "plants",
      name: "Water Plants",
      description: "",
      durationHours: 0.25,
      category: "living",
      iconKey: "plants",
      price: prices.plants,
    },
  ] as const;
}

const CATEGORY_ORDER: BookingOptionalExtraCategoryId[] = ["kitchen", "living", "laundry", "special"];

export function extrasGroupedByCategory(prices: Record<WidgetOptionalExtraId, number>): {
  category: BookingOptionalExtraCategoryId;
  items: BookingOptionalExtraDef[];
}[] {
  const catalog = buildBookingOptionalExtrasCatalog(prices);
  const map = new Map<BookingOptionalExtraCategoryId, BookingOptionalExtraDef[]>();
  for (const ex of catalog) {
    const list = map.get(ex.category) ?? [];
    list.push(ex);
    map.set(ex.category, list);
  }
  return CATEGORY_ORDER.filter((c) => (map.get(c)?.length ?? 0) > 0).map((category) => ({
    category,
    items: map.get(category)!,
  }));
}
