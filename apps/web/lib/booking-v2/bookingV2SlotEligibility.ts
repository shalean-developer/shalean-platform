import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assessBookingFulfillment,
  type BookingFulfillmentAssessment,
} from "@/lib/booking/assessBookingFulfillment";
import { countEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
import {
  canonicalServiceSlugFromBookingV2,
  deriveDurationMinutesFromBookingV2,
  parseServiceDetailInt,
} from "@/lib/booking-v2/bookingV2ServiceSlug";
import type { BookingV2LocationContext } from "@/lib/booking-v2/bookingV2LocationContext";
import { SOFT_FULFILLMENT_CUSTOMER_COPY } from "@/lib/booking/bookingFulfillmentMode";

export type BookingV2SlotEligibilityParams = {
  serviceSlug: string;
  date: string;
  time: string;
  location: BookingV2LocationContext;
  serviceDetails?: Record<string, string | number | boolean>;
  durationMinutes?: number | null;
};

export async function countEligibleCleanersForBookingV2Slot(
  admin: SupabaseClient,
  params: BookingV2SlotEligibilityParams,
): Promise<number> {
  const timeHm = params.time.trim().slice(0, 5);
  const durationMinutes = deriveDurationMinutesFromBookingV2(
    params.serviceSlug,
    params.durationMinutes,
  );
  const canonicalService = canonicalServiceSlugFromBookingV2(params.serviceSlug);

  return countEligibleCleaners(admin, {
    date: params.date,
    startTime: timeHm,
    durationMinutes,
    locationId: params.location.locationId,
    locationExpandedIds: [params.location.locationId],
    serviceType: canonicalService,
    enforcePublicDailyWorkloadLimit: true,
  });
}

export async function bookingV2SlotHasEligibleCleaners(
  admin: SupabaseClient,
  params: BookingV2SlotEligibilityParams,
): Promise<boolean> {
  const count = await countEligibleCleanersForBookingV2Slot(admin, params);
  return count > 0;
}

export async function assessBookingV2SlotFulfillment(
  admin: SupabaseClient,
  params: BookingV2SlotEligibilityParams,
): Promise<BookingFulfillmentAssessment> {
  const timeHm = params.time.trim().slice(0, 5);
  const durationMinutes = deriveDurationMinutesFromBookingV2(
    params.serviceSlug,
    params.durationMinutes,
  );
  const canonicalService = canonicalServiceSlugFromBookingV2(params.serviceSlug);

  const assessment = await assessBookingFulfillment(admin, {
    date: params.date,
    startTime: timeHm,
    durationMinutes,
    locationId: params.location.locationId,
    locationExpandedIds: [params.location.locationId],
    serviceType: canonicalService,
  });

  // A resolved Booking V2 service area is bookable even when no cleaner is
  // immediately discoverable. Take payment and place the booking in the
  // existing operations-assignment queue; area review remains for unresolved
  // locations before this function is called.
  if (assessment.mode === "area_review" && assessment.reason === "no_active_cleaner_coverage") {
    return {
      ...assessment,
      mode: "ops_assignment",
      reason: "known_area_pending_ops_assignment",
      requiresPayment: true,
      customerMessage: SOFT_FULFILLMENT_CUSTOMER_COPY.opsAssignment,
    };
  }

  return assessment;
}

export function bedroomsBathroomsFromV2ServiceDetails(
  serviceDetails: Record<string, string | number | boolean> | undefined,
): { bedrooms: number; bathrooms: number; extraRooms: number } {
  return {
    // Studios may have 0 bedrooms (UAT-BOOK-ENH-001 / UAT-PRICE-003).
    bedrooms: Math.max(0, parseServiceDetailInt(serviceDetails, "bedrooms", 2)),
    bathrooms: Math.max(1, parseServiceDetailInt(serviceDetails, "bathrooms", 1)),
    extraRooms: Math.max(0, parseServiceDetailInt(serviceDetails, "extraRooms", 0)),
  };
}
