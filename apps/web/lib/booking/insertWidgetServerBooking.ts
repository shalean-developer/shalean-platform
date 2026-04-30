import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import type { WidgetIntakePayload } from "@/lib/booking/bookingWidgetDraft";
import { mapWidgetExtrasToStep1Ids, mapWidgetServiceToBookingServiceId } from "@/lib/booking/bookingWidgetDraft";
import { insertBookingRowUnified } from "@/lib/booking/createBookingUnified";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import {
  calculateHomeWidgetQuoteZar,
  type HomeWidgetQuoteInput,
} from "@/lib/pricing/calculatePrice";

export async function serverWidgetQuoteFromIntake(
  admin: SupabaseClient,
  intake: WidgetIntakePayload,
): Promise<number> {
  const snapshot = await buildPricingRatesSnapshotFromDb(admin);
  if (!snapshot) {
    throw new Error("serverWidgetQuoteFromIntake: pricing catalog unavailable.");
  }
  const input: HomeWidgetQuoteInput = {
    bedrooms: intake.bedrooms,
    bathrooms: intake.bathrooms,
    extraRooms: intake.extraRooms ?? 0,
    service: intake.service,
    extras: intake.extras,
  };
  return calculateHomeWidgetQuoteZar(input, snapshot);
}

export type InsertWidgetBookingResult =
  | { ok: true; bookingId: string; paystackReference: string; totalPaidZar: number }
  | { ok: false; error: string };

export async function insertWidgetDraftBookingRow(
  admin: SupabaseClient,
  intake: WidgetIntakePayload,
): Promise<InsertWidgetBookingResult> {
  const snapshot = await buildPricingRatesSnapshotFromDb(admin);
  if (!snapshot) {
    return { ok: false, error: "Pricing catalog unavailable." };
  }
  const input: HomeWidgetQuoteInput = {
    bedrooms: intake.bedrooms,
    bathrooms: intake.bathrooms,
    extraRooms: intake.extraRooms ?? 0,
    service: intake.service,
    extras: intake.extras,
  };
  const totalPaidZar = calculateHomeWidgetQuoteZar(input, snapshot);
  const serviceId = mapWidgetServiceToBookingServiceId(intake.service);
  const paystackReference = `widget_${crypto.randomUUID().replace(/-/g, "")}`;
  const extrasRaw = mapWidgetExtrasToStep1Ids(intake.extras);

  const ins = await insertBookingRowUnified(admin, {
    source: "homepage_widget",
    rowBase: {
      paystack_reference: paystackReference,
      customer_email: null as string | null,
      amount_paid_cents: 0,
      total_paid_cents: 0,
      base_amount_cents: 0,
      extras_amount_cents: 0,
      currency: "ZAR",
      status: "pending",
      dispatch_status: "searching",
      cleaner_response_status: CLEANER_RESPONSE.NONE,
      surge_multiplier: 1,
      service: getServiceLabel(serviceId),
      location: intake.location?.trim() || null,
      date: intake.date,
      time: intake.time,
      total_paid_zar: totalPaidZar,
      service_fee_cents: 0,
    },
    rooms: intake.bedrooms,
    bathrooms: intake.bathrooms,
    extrasRaw,
    serviceSlugForFlat: intake.service,
    locationForFlat: intake.location?.trim() || null,
    dateForFlat: intake.date,
    timeForFlat: intake.time,
    snapshotExtension: {
      source: "homepage_widget",
      intake,
      serverTotalZar: totalPaidZar,
      pricingModel: "home_widget_v1",
    },
    select: "id",
    lineItemsPricing: {
      mode: "home_widget_catalog",
      snapshot,
      widgetService: intake.service,
      extraRooms: intake.extraRooms ?? 0,
    },
  });

  if (!ins.ok) {
    return { ok: false, error: ins.error };
  }
  return { ok: true, bookingId: ins.id, paystackReference, totalPaidZar };
}
