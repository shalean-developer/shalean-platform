import type { RegularCleaningDetailsStage } from "@/src/features/booking-v2/steps/regularCleaningProgressiveDisclosure";

type DeepCleaningBookingDetails = {
  address?: string;
  suburb?: string;
  contactPhone?: string;
  serviceAreaLocationId?: string;
};

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

  const roomsReady = ["bedrooms", "bathrooms", "extraRooms", "lastCleaned"].every((key) =>
    Boolean(String(serviceDetails[key] ?? "").trim()),
  );
  if (!roomsReady) return "rooms";
  if (!String(serviceDetails.hasPets ?? "").trim()) return "pets";
  return "equipment";
}

export function deepCleaningStageReady(
  stage: RegularCleaningDetailsStage,
  serviceDetails: Record<string, string | number | boolean>,
  bookingDetails: DeepCleaningBookingDetails,
): boolean {
  if (stage === "address") return deepCleaningAddressReady(bookingDetails);
  if (stage === "property") return Boolean(String(serviceDetails.propertyType ?? "").trim());
  if (stage === "rooms") {
    return ["bedrooms", "bathrooms", "extraRooms", "lastCleaned"].every((key) =>
      Boolean(String(serviceDetails[key] ?? "").trim()),
    );
  }
  if (stage === "pets") return Boolean(String(serviceDetails.hasPets ?? "").trim());
  return true;
}
