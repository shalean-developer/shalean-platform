/** Shared bedroom / bathroom chip options for booking-v2 (UAT-BOOK-ENH-001). */

export const BEDROOM_CHIP_VALUES = ["0", "1", "2", "3+"] as const;
export const BATHROOM_CHIP_VALUES = ["1", "2", "3", "4+"] as const;
export const EXTRA_ROOM_CHIP_VALUES = ["0", "1", "2", "3+"] as const;

export type RoomKind = "bedrooms" | "bathrooms" | "extraRooms";

export type BedroomChipValue = (typeof BEDROOM_CHIP_VALUES)[number];
export type BathroomChipValue = (typeof BATHROOM_CHIP_VALUES)[number];
export type ExtraRoomChipValue = (typeof EXTRA_ROOM_CHIP_VALUES)[number];

export function roomCountCustomMinimum(kind: RoomKind): number {
  return kind === "bathrooms" ? 4 : 3;
}

export function roomCountCustomChip(kind: RoomKind): string {
  return `${roomCountCustomMinimum(kind)}+`;
}

export const BEDROOM_COUNT_OPTIONS = BEDROOM_CHIP_VALUES.map((value) => ({
  value,
  label:
    value === "0"
      ? "0 bedrooms"
      : value === "3+"
        ? "3+ Custom"
        : `${value} bedroom${value === "1" ? "" : "s"}`,
}));

export const BATHROOM_COUNT_OPTIONS = BATHROOM_CHIP_VALUES.map((value) => ({
  value,
  label: value === "4+" ? "4+ Custom" : `${value} bathroom${value === "1" ? "" : "s"}`,
}));

export const EXTRA_ROOM_COUNT_OPTIONS = EXTRA_ROOM_CHIP_VALUES.map((value) => ({
  value,
  label:
    value === "0"
      ? "No extra rooms"
      : value === "3+"
        ? "3+ Custom"
        : `${value} extra room${value === "1" ? "" : "s"}`,
}));

/** Map a stored exact count to the chip that should appear selected. */
export function roomCountToChip(value: string | number | undefined | null, kind: RoomKind): string {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return "";
  const customMinimum = roomCountCustomMinimum(kind);
  if (n >= customMinimum) return roomCountCustomChip(kind);
  if ((kind === "bedrooms" || kind === "extraRooms") && n >= 0) return String(n);
  if (kind === "bathrooms" && n >= 1) return String(n);
  return "";
}

export function isExactRoomCount(value: string | number | undefined | null): boolean {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 0;
}

export function roomCountChipLabel(chip: string): string {
  return chip.endsWith("+") ? `${chip} Custom` : chip;
}
