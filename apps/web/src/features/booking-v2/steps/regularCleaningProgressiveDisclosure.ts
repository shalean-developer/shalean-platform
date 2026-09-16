export type RegularCleaningDetailsStage =
  | "property"
  | "rooms"
  | "pets"
  | "address"
  | "equipment";

export const REGULAR_CLEANING_DETAILS_STAGES: readonly RegularCleaningDetailsStage[] = [
  "address",
  "property",
  "rooms",
  "pets",
  "equipment",
];

export function regularCleaningDetailsStageFromSearchParam(
  value: string | null,
): RegularCleaningDetailsStage | null {
  return REGULAR_CLEANING_DETAILS_STAGES.includes(value as RegularCleaningDetailsStage)
    ? (value as RegularCleaningDetailsStage)
    : null;
}

export function isRegularCleaningStageComplete(
  stage: RegularCleaningDetailsStage,
  currentStage: RegularCleaningDetailsStage,
): boolean {
  return REGULAR_CLEANING_DETAILS_STAGES.indexOf(stage) <
    REGULAR_CLEANING_DETAILS_STAGES.indexOf(currentStage);
}

export function adjacentRegularCleaningStage(
  stage: RegularCleaningDetailsStage,
  direction: "back" | "next",
): RegularCleaningDetailsStage | null {
  const currentIndex = REGULAR_CLEANING_DETAILS_STAGES.indexOf(stage);
  const adjacentIndex = direction === "back" ? currentIndex - 1 : currentIndex + 1;
  return REGULAR_CLEANING_DETAILS_STAGES[adjacentIndex] ?? null;
}

export function regularCleaningAutoAdvanceTarget(
  stage: RegularCleaningDetailsStage,
  serviceDetails: Record<string, string | number | boolean>,
): RegularCleaningDetailsStage | null {
  if (
    stage === "property" &&
    Boolean(String(serviceDetails.propertyType ?? "").trim())
  ) {
    return "rooms";
  }

  if (
    stage === "rooms" &&
    ["bedrooms", "bathrooms", "extraRooms"].every((key) =>
      Boolean(String(serviceDetails[key] ?? "").trim()),
    )
  ) {
    return "pets";
  }

  if (
    stage === "pets" &&
    Boolean(String(serviceDetails.hasPets ?? "").trim())
  ) {
    return "equipment";
  }

  return null;
}

type RegularCleaningBookingDetails = {
  address?: string;
  suburb?: string;
  contactPhone?: string;
  serviceAreaLocationId?: string;
};

export function regularCleaningAddressReady(
  bookingDetails: RegularCleaningBookingDetails,
): boolean {
  return (
    String(bookingDetails.address ?? "").trim().length >= 5 &&
    String(bookingDetails.suburb ?? "").trim().length >= 2 &&
    Boolean(String(bookingDetails.contactPhone ?? "").trim()) &&
    Boolean(String(bookingDetails.serviceAreaLocationId ?? "").trim())
  );
}

export function regularCleaningDetailsStage(
  serviceDetails: Record<string, string | number | boolean>,
  bookingDetails: RegularCleaningBookingDetails = {},
): RegularCleaningDetailsStage {
  if (!regularCleaningAddressReady(bookingDetails)) return "address";

  if (!String(serviceDetails.propertyType ?? "").trim()) return "property";

  const hasBedrooms = Boolean(String(serviceDetails.bedrooms ?? "").trim());
  const hasBathrooms = Boolean(String(serviceDetails.bathrooms ?? "").trim());
  const hasExtraRoomsChoice = Boolean(String(serviceDetails.extraRooms ?? "").trim());
  if (!hasBedrooms || !hasBathrooms || !hasExtraRoomsChoice) return "rooms";

  if (!String(serviceDetails.hasPets ?? "").trim()) return "pets";

  return "equipment";
}
