import type { SupabaseClient } from "@supabase/supabase-js";
import { isBookingSoftFulfillmentEnabled } from "@/lib/booking/availabilityFlags";
import {
  type BookingFulfillmentMode,
  SOFT_FULFILLMENT_CUSTOMER_COPY,
} from "@/lib/booking/bookingFulfillmentMode";
import { countOpsAssignableCleaners } from "@/lib/booking/countOpsAssignableCleaners";
import { countEligibleCleaners } from "@/lib/booking/getEligibleCleaners";

export type AssessBookingFulfillmentParams = {
  date: string;
  startTime: string;
  durationMinutes: number;
  locationId: string;
  locationExpandedIds: string[] | null;
  serviceType?: string | null;
  serviceLabelForCapability?: string | null;
  /** When false, never returns soft modes (legacy hard gate). */
  softFulfillment?: boolean;
};

export type BookingFulfillmentAssessment = {
  mode: BookingFulfillmentMode;
  reason: string;
  instantCount: number;
  opsCount: number;
  requiresPayment: boolean;
  customerMessage: string;
};

/**
 * Answers: can Shalean realistically fulfil this booking?
 * - instant: eligible cleaner online for the slot
 * - ops_assignment: active cleaner covers area (may be offline); pay + ops queue
 * - area_review: no coverage; unpaid lead
 */
export async function assessBookingFulfillment(
  admin: SupabaseClient,
  params: AssessBookingFulfillmentParams,
): Promise<BookingFulfillmentAssessment> {
  const soft = params.softFulfillment ?? isBookingSoftFulfillmentEnabled();
  const locationId = params.locationId.trim();
  const expanded =
    params.locationExpandedIds ?? (locationId ? [locationId] : []);

  if (!locationId || expanded.length === 0) {
    return {
      mode: soft ? "area_review" : "instant",
      reason: "unresolved_service_area",
      instantCount: 0,
      opsCount: 0,
      requiresPayment: false,
      customerMessage: soft
        ? SOFT_FULFILLMENT_CUSTOMER_COPY.areaReview
        : "We could not match your suburb to a service area.",
    };
  }

  const instantCount = await countEligibleCleaners(admin, {
    date: params.date,
    startTime: params.startTime,
    durationMinutes: params.durationMinutes,
    locationId,
    locationExpandedIds: expanded,
    serviceType: params.serviceType,
    serviceLabelForCapability: params.serviceLabelForCapability,
    enforcePublicDailyWorkloadLimit: true,
  });

  if (instantCount > 0) {
    return {
      mode: "instant",
      reason: "eligible_cleaner_available",
      instantCount,
      opsCount: instantCount,
      requiresPayment: true,
      customerMessage: "",
    };
  }

  if (!soft) {
    return {
      mode: "instant",
      reason: "no_eligible_cleaner_soft_disabled",
      instantCount: 0,
      opsCount: 0,
      requiresPayment: true,
      customerMessage: "No cleaners are available for this date and time in your area.",
    };
  }

  const opsCount = await countOpsAssignableCleaners(admin, {
    date: params.date,
    locationId,
    locationExpandedIds: expanded,
    serviceType: params.serviceType,
    serviceLabelForCapability: params.serviceLabelForCapability,
  });

  if (opsCount > 0) {
    return {
      mode: "ops_assignment",
      reason: "ops_assignable_coverage",
      instantCount: 0,
      opsCount,
      requiresPayment: true,
      customerMessage: SOFT_FULFILLMENT_CUSTOMER_COPY.opsAssignment,
    };
  }

  return {
    mode: "area_review",
    reason: "no_active_cleaner_coverage",
    instantCount: 0,
    opsCount: 0,
    requiresPayment: false,
    customerMessage: SOFT_FULFILLMENT_CUSTOMER_COPY.areaReview,
  };
}
