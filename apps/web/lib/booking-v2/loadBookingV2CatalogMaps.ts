import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2ExtraTypeFilter } from "@/lib/booking-v2/bookingV2CatalogTypes";

export const DB_SLUG_MAP: Record<ServiceSlug, string> = {
  "regular-cleaning": "standard",
  "deep-cleaning": "deep",
  "moving-cleaning": "move",
  "office-cleaning": "office",
  "carpet-cleaning": "carpet",
  "airbnb-cleaning": "airbnb",
};

export const EXTRA_TYPE_MAP: Record<ServiceSlug, BookingV2ExtraTypeFilter[]> = {
  "regular-cleaning": ["light", "all"],
  "deep-cleaning": ["heavy", "all"],
  "moving-cleaning": ["heavy", "all"],
  "office-cleaning": ["light", "all"],
  "carpet-cleaning": ["heavy", "all"],
  "airbnb-cleaning": ["light", "all"],
};
