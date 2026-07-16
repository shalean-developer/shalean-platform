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

  return assessBookingFulfillment(admin, {
    date: params.date,
    startTime: timeHm,
    durationMinutes,
    locationId: params.location.locationId,
    locationExpandedIds: [params.location.locationId],
    serviceType: canonicalService,
  });
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
