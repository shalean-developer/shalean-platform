/**
 * Coerce heterogeneous client/admin payloads toward a single shape before validation
 * (`assertBookingScope`, `sanitizeBookingExtrasForPersist`, unified insert).
 */
export type NormalizedBookingScopeInput = {
  service: string;
  rooms: number;
  bathrooms: number;
  extras: unknown[];
  source: string;
};

export function normalizeBookingInput(input: Record<string, unknown>): NormalizedBookingScopeInput {
  const service = typeof input.service === "string" ? input.service : String(input.service ?? "");
  const rooms = Number(input.rooms ?? input.bedrooms ?? 0);
  const bathrooms = Number(input.bathrooms ?? 0);
  const extras = Array.isArray(input.extras) ? input.extras : [];
  const source = typeof input.source === "string" && input.source.trim() ? input.source.trim() : "unknown";
  return { service, rooms, bathrooms, extras, source };
}
