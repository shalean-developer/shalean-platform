import type { BookingServiceId } from "@/components/booking/serviceCategories";

const CANONICAL_SERVICE_IDS = new Set<BookingServiceId>(["standard", "airbnb", "deep", "move", "carpet"]);

function normalizeServiceToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function canonicalizeBookingServiceSlug(value: unknown): BookingServiceId {
  const token = normalizeServiceToken(value);
  if ((CANONICAL_SERVICE_IDS as Set<string>).has(token)) return token as BookingServiceId;

  switch (token) {
    case "standard_cleaning":
    case "standard_clean":
    case "regular":
    case "regular_cleaning":
    case "regular_clean":
    case "quick":
    case "quick_cleaning":
    case "quick_clean":
      return "standard";
    case "airbnb_cleaning":
    case "airbnb_clean":
    case "air_bnb":
      return "airbnb";
    case "deep_cleaning":
    case "deep_clean":
      return "deep";
    case "move_cleaning":
    case "move_clean":
    case "move_in_out_cleaning":
    case "move_in_out_clean":
    case "move_in_cleaning":
    case "move_out_cleaning":
      return "move";
    case "carpet_cleaning":
    case "carpet_clean":
      return "carpet";
    default:
      return "standard";
  }
}
