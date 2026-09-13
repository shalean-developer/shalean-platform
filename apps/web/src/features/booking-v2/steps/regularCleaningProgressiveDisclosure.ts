export type RegularCleaningDetailsStage = "property" | "rooms" | "remaining";

export function regularCleaningDetailsStage(
  serviceDetails: Record<string, string | number | boolean>,
): RegularCleaningDetailsStage {
  if (!String(serviceDetails.propertyType ?? "").trim()) return "property";

  const hasBedrooms = Boolean(String(serviceDetails.bedrooms ?? "").trim());
  const hasBathrooms = Boolean(String(serviceDetails.bathrooms ?? "").trim());
  return hasBedrooms && hasBathrooms ? "remaining" : "rooms";
}
