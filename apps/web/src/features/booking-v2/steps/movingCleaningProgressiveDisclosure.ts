export type MovingCleaningDetailsStage =
  | "address"
  | "property"
  | "move"
  | "rooms"
  | "condition";

type Details = Record<string, unknown>;
type Address = {
  address?: string;
  suburb?: string;
  contactPhone?: string;
  serviceAreaLocationId?: string;
};

const STAGES: MovingCleaningDetailsStage[] = [
  "address",
  "property",
  "move",
  "rooms",
  "condition",
];

function has(details: Details, key: string): boolean {
  return Boolean(String(details[key] ?? "").trim());
}

export function movingCleaningAddressReady(address: Address): boolean {
  return Boolean(
    address.address?.trim() &&
      address.suburb?.trim() &&
      address.contactPhone?.trim() &&
      address.serviceAreaLocationId?.trim(),
  );
}

export function movingCleaningDetailsStage(
  details: Details,
  address: Address = {},
): MovingCleaningDetailsStage {
  if (!movingCleaningAddressReady(address)) return "address";
  if (!has(details, "propertyType")) return "property";
  if (!has(details, "moveType")) return "move";
  if (!["bedrooms", "bathrooms", "extraRooms"].every((key) => has(details, key))) return "rooms";
  return "condition";
}

export function movingCleaningStageReady(
  stage: MovingCleaningDetailsStage,
  details: Details,
  address: Address,
): boolean {
  if (stage === "address") return movingCleaningAddressReady(address);
  if (stage === "property") return has(details, "propertyType");
  if (stage === "move") return has(details, "moveType");
  if (stage === "rooms") return ["bedrooms", "bathrooms", "extraRooms"].every((key) => has(details, key));
  if (stage === "condition") {
    const baseReady = has(details, "furnished") && has(details, "hasPets");
    return String(details.moveType ?? "") === "move_out"
      ? baseReady && has(details, "depositInspection")
      : baseReady;
  }
  return false;
}

export function movingCleaningShowsExtras(stage: MovingCleaningDetailsStage | null): boolean {
  return stage === "condition";
}

export function adjacentMovingCleaningStage(
  stage: MovingCleaningDetailsStage,
  direction: "back" | "next",
): MovingCleaningDetailsStage | null {
  const index = STAGES.indexOf(stage);
  if (index < 0) return null;
  const target = direction === "next" ? index + 1 : index - 1;
  return STAGES[target] ?? null;
}

export function movingCleaningAutoAdvanceTarget(
  stage: MovingCleaningDetailsStage,
  details: Details,
): MovingCleaningDetailsStage | null {
  if (stage === "property" && has(details, "propertyType")) return "move";
  if (stage === "move" && has(details, "moveType")) return "rooms";
  return null;
}

export function movingCleaningDetailsStageFromSearchParam(
  value: string | null | undefined,
): MovingCleaningDetailsStage | null {
  return STAGES.includes(value as MovingCleaningDetailsStage)
    ? (value as MovingCleaningDetailsStage)
    : null;
}
