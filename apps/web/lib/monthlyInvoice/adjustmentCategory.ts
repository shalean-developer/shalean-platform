export type AdjustmentCategory = "missed_visit" | "extra_service" | "discount" | "other";

export function parseAdjustmentCategory(raw: unknown): AdjustmentCategory {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "missed_visit" || s === "extra_service" || s === "discount" || s === "other") {
    return s;
  }
  return "other";
}

export function adjustmentCategoryLabel(c: AdjustmentCategory): string {
  switch (c) {
    case "missed_visit":
      return "Missed visit";
    case "extra_service":
      return "Extra service";
    case "discount":
      return "Discount";
    default:
      return "Other";
  }
}
