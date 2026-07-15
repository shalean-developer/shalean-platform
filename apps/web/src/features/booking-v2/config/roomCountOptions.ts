/** Shared bedroom / bathroom chip options for booking-v2 (UAT-BOOK-ENH-001). */

export const BEDROOM_CHIP_VALUES = ["0", "1", "2", "3", "4", "5", "6+"] as const;
export const BATHROOM_CHIP_VALUES = ["1", "2", "3", "4", "5", "6+"] as const;

export type BedroomChipValue = (typeof BEDROOM_CHIP_VALUES)[number];
export type BathroomChipValue = (typeof BATHROOM_CHIP_VALUES)[number];

export const BEDROOM_COUNT_OPTIONS = BEDROOM_CHIP_VALUES.map((value) => ({
  value,
  label: value === "0" ? "0 bedrooms" : value === "6+" ? "6+ bedrooms" : `${value} bedroom${value === "1" ? "" : "s"}`,
}));

export const BATHROOM_COUNT_OPTIONS = BATHROOM_CHIP_VALUES.map((value) => ({
  value,
  label: value === "6+" ? "6+ bathrooms" : `${value} bathroom${value === "1" ? "" : "s"}`,
}));

/** Map a stored exact count to the chip that should appear selected. */
export function roomCountToChip(value: string | number | undefined | null, kind: "bedrooms" | "bathrooms"): string {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return "";
  if (n >= 6) return "6+";
  if (kind === "bedrooms" && n >= 0 && n <= 5) return String(n);
  if (kind === "bathrooms" && n >= 1 && n <= 5) return String(n);
  return "";
}

export function isExactRoomCount(value: string | number | undefined | null): boolean {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 0;
}
