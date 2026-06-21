export type AdjustmentCategory = "missed_visit" | "extra_service" | "discount" | "late_fee" | "other";

export function parseAdjustmentCategory(raw: unknown): AdjustmentCategory {
  const s = String(raw ?? "").trim().toLowerCase();
  if (
    s === "missed_visit" ||
    s === "extra_service" ||
    s === "discount" ||
    s === "late_fee" ||
    s === "other"
  ) {
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
    case "late_fee":
      return "Late payment fee";
    default:
      return "Other";
  }
}
