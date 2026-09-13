export type RegularCleaningDetailsStage =
  | "property"
  | "rooms"
  | "pets"
  | "address"
  | "equipment";

type RegularCleaningBookingDetails = {
  address?: string;
  suburb?: string;
  contactPhone?: string;
  serviceAreaLocationId?: string;
};

export function regularCleaningDetailsStage(
  serviceDetails: Record<string, string | number | boolean>,
  bookingDetails: RegularCleaningBookingDetails = {},
): RegularCleaningDetailsStage {
  if (!String(serviceDetails.propertyType ?? "").trim()) return "property";

  const hasBedrooms = Boolean(String(serviceDetails.bedrooms ?? "").trim());
  const hasBathrooms = Boolean(String(serviceDetails.bathrooms ?? "").trim());
  if (!hasBedrooms || !hasBathrooms) return "rooms";

  if (!String(serviceDetails.hasPets ?? "").trim()) return "pets";

  const addressReady =
    String(bookingDetails.address ?? "").trim().length >= 5 &&
    String(bookingDetails.suburb ?? "").trim().length >= 2 &&
    Boolean(String(bookingDetails.contactPhone ?? "").trim()) &&
    Boolean(String(bookingDetails.serviceAreaLocationId ?? "").trim());

  return addressReady ? "equipment" : "address";
}
