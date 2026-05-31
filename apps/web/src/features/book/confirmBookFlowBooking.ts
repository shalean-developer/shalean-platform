import type { BookFlowFormState } from "@/src/features/book/bookFlowTypes";
import { getSession } from "@/lib/auth/authClient";

export type ConfirmBookFlowPayload = {
  form: BookFlowFormState;
};

export async function confirmBookFlowBooking(
  payload: ConfirmBookFlowPayload,
): Promise<{ success: true; bookingId: string } | { success: false; error: string }> {
  const session = await getSession();
  if (!session?.access_token) {
    return { success: false, error: "Sign in to confirm your booking." };
  }

  const { form } = payload;
  if (!form.cleaner?.id) return { success: false, error: "Select a cleaner." };
  if (!form.date || !form.time) return { success: false, error: "Pick a date and time." };
  if (form.location.trim().length < 3) return { success: false, error: "Enter your address." };

  let res: Response;
  try {
    res = await fetch("/api/book/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        service: form.service,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        extraRooms: form.extraRooms,
        extras: form.extras,
        date: form.date,
        time: form.time,
        location: form.location.trim(),
        serviceAreaLocationId: form.serviceAreaLocationId,
        serviceAreaCityId: form.serviceAreaCityId,
        serviceAreaName: form.serviceAreaName,
        selected_cleaner_id: form.cleaner.id,
      }),
    });
  } catch {
    return { success: false, error: "Network error. Try again." };
  }

  const json = (await res.json()) as { success?: boolean; bookingId?: string; error?: string };
  if (!res.ok || json.success !== true || typeof json.bookingId !== "string" || !json.bookingId) {
    return { success: false, error: typeof json.error === "string" ? json.error : "Could not confirm booking." };
  }

  return { success: true, bookingId: json.bookingId };
}
