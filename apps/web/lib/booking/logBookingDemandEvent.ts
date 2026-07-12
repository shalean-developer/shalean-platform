import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingFulfillmentMode } from "@/lib/booking/bookingFulfillmentMode";

export type BookingDemandEventType =
  | "slot_exhausted"
  | "ops_reserve_started"
  | "area_review_started"
  | "area_review_converted"
  | "cancelled";

export type LogBookingDemandEventParams = {
  eventType: BookingDemandEventType;
  suburb?: string | null;
  city?: string | null;
  postalCode?: string | null;
  locationId?: string | null;
  serviceSlug?: string | null;
  serviceLabel?: string | null;
  requestedDate?: string | null;
  requestedTime?: string | null;
  fulfillmentMode?: BookingFulfillmentMode | null;
  bookingId?: string | null;
  userId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
};

/** Best-effort demand capture — never throws to callers. */
export async function logBookingDemandEvent(
  admin: SupabaseClient,
  params: LogBookingDemandEventParams,
): Promise<void> {
  try {
    const { error } = await admin.from("booking_demand_events").insert({
      event_type: params.eventType,
      suburb: params.suburb?.trim() || null,
      city: params.city?.trim() || null,
      postal_code: params.postalCode?.trim() || null,
      location_id: params.locationId?.trim() || null,
      service_slug: params.serviceSlug?.trim() || null,
      service_label: params.serviceLabel?.trim() || null,
      requested_date: params.requestedDate?.trim() || null,
      requested_time: params.requestedTime?.trim().slice(0, 5) || null,
      fulfillment_mode: params.fulfillmentMode ?? null,
      booking_id: params.bookingId ?? null,
      user_id: params.userId ?? null,
      source: params.source?.trim() || null,
      metadata: params.metadata ?? {},
    });
    if (error) {
      console.error("[logBookingDemandEvent]", error.message);
    }
  } catch (e) {
    console.error("[logBookingDemandEvent] threw", e);
  }
}
