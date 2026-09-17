import type { RegularCleaningDetailsStage } from "@/src/features/booking-v2/steps/regularCleaningProgressiveDisclosure";

type DeepCleaningBookingDetails = {
  address?: string;
  suburb?: string;
  contactPhone?: string;
  serviceAreaLocationId?: string;
};

const DEEP_CLEANING_STAGES: RegularCleaningDetailsStage[] = [
  "address",
  "property",
  "rooms",
  "pets",
];

function deepCleaningAddressReady(bookingDetails: DeepCleaningBookingDetails): boolean {
  return (
    String(bookingDetails.address ?? "").trim().length >= 5 &&
    String(bookingDetails.suburb ?? "").trim().length >= 2 &&
    Boolean(String(bookingDetails.contactPhone ?? "").trim()) &&
    Boolean(String(bookingDetails.serviceAreaLocationId ?? "").trim())
  );
}

export function deepCleaningDetailsStage(
  serviceDetails: Record<string, string | number | boolean>,
  bookingDetails: DeepCleaningBookingDetails = {},
): RegularCleaningDetailsStage {
  if (!deepCleaningAddressReady(bookingDetails)) return "address";
  if (!String(serviceDetails.propertyType ?? "").trim()) return "property";

  const roomsReady = ["bedrooms", "bathrooms", "extraRooms"].every((key) =>
    Boolean(String(serviceDetails[key] ?? "").trim()),
  );
  if (!roomsReady) return "rooms";
  return "pets";
}

export function deepCleaningStageReady(
  stage: RegularCleaningDetailsStage,
  serviceDetails: Record<string, string | number | boolean>,
  bookingDetails: DeepCleaningBookingDetails,
): boolean {
  if (stage === "address") return deepCleaningAddressReady(bookingDetails);
  if (stage === "property") return Boolean(String(serviceDetails.propertyType ?? "").trim());
  if (stage === "rooms") {
    return ["bedrooms", "bathrooms", "extraRooms"].every((key) =>
      Boolean(String(serviceDetails[key] ?? "").trim()),
    );
  }
  if (stage === "pets") {
    return ["lastCleaned", "hasPets"].every((key) =>
      Boolean(String(serviceDetails[key] ?? "").trim()),
    );
  }
  return false;
}

export function adjacentDeepCleaningStage(
  stage: RegularCleaningDetailsStage,
  direction: "back" | "next",
): RegularCleaningDetailsStage | null {
  const index = DEEP_CLEANING_STAGES.indexOf(stage);
  if (index === -1) return null;
  const targetIndex = direction === "next" ? index + 1 : index - 1;
  return DEEP_CLEANING_STAGES[targetIndex] ?? null;
}

/** Deep-clean add-ons belong to the final details stage before scheduling. */
export function deepCleaningShowsExtras(
  stage: RegularCleaningDetailsStage | null,
): boolean {
  return stage === "pets";
}
