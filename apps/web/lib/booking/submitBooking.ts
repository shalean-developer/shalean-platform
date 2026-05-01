import { clearSelectedCleanerFromStorage, writeSelectedCleanerToStorage } from "@/lib/booking/cleanerSelection";
import { clearLockedBookingFromStorage } from "@/lib/booking/lockedBooking";

export type SubmitBookingPayload = {
  service: string;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  date: string | null;
  time: string | null;
  location: string;
  locationSlug?: string | null;
  serviceAreaLocationId?: string | null;
  serviceAreaCityId?: string | null;
  serviceAreaName?: string | null;
  cleanerId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
};

export async function submitBooking(
  payload: SubmitBookingPayload,
): Promise<{ success: true; bookingId: string } | { success: false; error: string }> {
  if (!payload.date || !payload.time) return { success: false, error: "Pick a date and time." };
  if (payload.location.trim().length < 3) return { success: false, error: "Enter your address (at least 3 characters)." };

  let res: Response;
  try {
    res = await fetch("/api/bookings/flow-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: payload.service,
        bedrooms: payload.bedrooms,
        bathrooms: payload.bathrooms,
        extraRooms: payload.extraRooms,
        extras: payload.extras,
        date: payload.date,
        time: payload.time,
        location: payload.location.trim(),
        locationSlug: payload.locationSlug != null && String(payload.locationSlug).trim() ? String(payload.locationSlug).trim() : null,
        serviceAreaLocationId:
          payload.serviceAreaLocationId != null && String(payload.serviceAreaLocationId).trim()
            ? String(payload.serviceAreaLocationId).trim()
            : null,
        serviceAreaCityId:
          payload.serviceAreaCityId != null && String(payload.serviceAreaCityId).trim()
            ? String(payload.serviceAreaCityId).trim()
            : null,
        serviceAreaName:
          payload.serviceAreaName != null && String(payload.serviceAreaName).trim()
            ? String(payload.serviceAreaName).trim()
            : null,
        selected_cleaner_id: payload.cleanerId != null && String(payload.cleanerId).trim() ? String(payload.cleanerId).trim() : null,
        customerName: payload.customerName,
        customerEmail: payload.customerEmail,
        customerPhone: payload.customerPhone,
      }),
    });
  } catch {
    return { success: false, error: "Network error. Try again." };
  }

  const json = (await res.json()) as { success?: boolean; bookingId?: string; error?: string };
  if (!res.ok || json.success !== true || typeof json.bookingId !== "string" || !json.bookingId) {
    return { success: false, error: typeof json.error === "string" ? json.error : "Could not create booking." };
  }

  try {
    clearLockedBookingFromStorage();
    const cid = payload.cleanerId != null && String(payload.cleanerId).trim() ? String(payload.cleanerId).trim() : null;
    if (cid) {
      writeSelectedCleanerToStorage({ id: cid, name: "Selected cleaner" });
    } else {
      clearSelectedCleanerFromStorage();
    }
  } catch {
    /* storage optional */
  }

  return { success: true, bookingId: json.bookingId };
}
