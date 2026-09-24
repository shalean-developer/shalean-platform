import { canonicalServiceSlugFromBookingV2 } from "@/lib/booking-v2/bookingV2ServiceSlug";
import { canonicalBookingCount } from "@/lib/booking-v2/carpetCountValidation";

type AirbnbScheduleVerificationInput = {
  date: string;
  time: string;
  locationId: string;
  serviceSlug: string;
  serviceDetails: Record<string, string | number | boolean>;
  selectedExtras: string[];
  durationMinutes: number;
};

function availabilityUrl(input: AirbnbScheduleVerificationInput): string {
  const bedrooms =
    canonicalBookingCount(input.serviceDetails.bedrooms, { min: 0, max: 25 }) ?? 0;
  const bathrooms =
    canonicalBookingCount(input.serviceDetails.bathrooms, { min: 1, max: 25 }) ?? 1;
  const extraRooms =
    canonicalBookingCount(input.serviceDetails.extraRooms, { min: 0, max: 25 }) ?? 0;
  const params = new URLSearchParams({
    date: input.date,
    serviceType: canonicalServiceSlugFromBookingV2(input.serviceSlug),
    bedrooms: String(bedrooms),
    bathrooms: String(bathrooms),
    duration: String(Math.max(30, Math.round(input.durationMinutes))),
    locationId: input.locationId,
  });
  if (extraRooms > 0) params.set("extraRooms", String(extraRooms));
  const extras = [...new Set(input.selectedExtras.map((extra) => extra.trim()).filter(Boolean))].sort();
  if (extras.length > 0) params.set("extras", extras.join(","));
  return `/api/booking/time-slots?${params.toString()}`;
}

export async function verifySelectedBookingV2Slot(
  input: AirbnbScheduleVerificationInput,
): Promise<boolean> {
  if (!input.date || !input.time || !input.locationId) return false;
  try {
    const response = await fetch(availabilityUrl(input));
    if (!response.ok) return false;
    const json = (await response.json()) as {
      slots?: Array<{ time?: string; available?: boolean }>;
    };
    const wanted = input.time.trim().slice(0, 5);
    return Boolean(
      (json.slots ?? []).some(
        (slot) => slot.time?.trim().slice(0, 5) === wanted && slot.available === true,
      ),
    );
  } catch {
    return false;
  }
}

export async function verifySelectedBookingV2Cleaners(
  input: AirbnbScheduleVerificationInput & { selectedCleanerIds: string[] },
): Promise<boolean> {
  if (input.selectedCleanerIds.length === 0) return true;
  if (!input.date || !input.time || !input.locationId) return false;

  const params = new URLSearchParams({
    serviceSlug: input.serviceSlug,
    date: input.date,
    time: input.time,
    durationMinutes: String(Math.max(30, Math.round(input.durationMinutes))),
    locationId: input.locationId,
  });

  try {
    const response = await fetch(`/api/booking-v2/available-cleaners?${params.toString()}`);
    if (!response.ok) return false;
    const json = (await response.json()) as {
      cleaners?: Array<{ id?: string; isAvailable?: boolean; slotEligible?: boolean }>;
    };
    const eligible = new Set(
      (json.cleaners ?? [])
        .filter((cleaner) => cleaner.isAvailable !== false && cleaner.slotEligible !== false)
        .map((cleaner) => cleaner.id)
        .filter((id): id is string => Boolean(id)),
    );
    return input.selectedCleanerIds.every((id) => eligible.has(id));
  } catch {
    return false;
  }
}
