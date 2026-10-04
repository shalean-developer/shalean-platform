export type BookingV2ScheduleVerificationInputs = {
  dateYmd: string | null;
  locationId: string | null;
  serviceSlug: string;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  durationMinutes: number;
};

export function normalizedBookingDurationMinutes(durationMinutes: number): number {
  return Number.isFinite(durationMinutes) ? Math.max(30, Math.round(durationMinutes)) : 120;
}

export function bookingV2ScheduleAvailabilityCacheKey(
  inputs: BookingV2ScheduleVerificationInputs,
): string | null {
  const dateYmd = inputs.dateYmd?.trim();
  const locationId = inputs.locationId?.trim();
  const serviceSlug = inputs.serviceSlug.trim();
  if (!dateYmd || !locationId || !serviceSlug) return null;

  const extras = [...new Set(inputs.extras.map((extra) => extra.trim()).filter(Boolean))].sort();
  return JSON.stringify({
    dateYmd,
    locationId,
    serviceSlug,
    bedrooms: inputs.bedrooms,
    bathrooms: inputs.bathrooms,
    extraRooms: inputs.extraRooms,
    extras,
    durationMinutes: normalizedBookingDurationMinutes(inputs.durationMinutes),
  });
}

export function isSelectedBookingSlotVerified(
  time: string,
  availability: Record<string, boolean> | undefined,
  slotsVerified: boolean,
): boolean {
  return slotsVerified && Boolean(time.trim()) && availability?.[time] === true;
}
