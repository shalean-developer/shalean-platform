import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import type { WidgetIntakePayload } from "@/lib/booking/bookingWidgetDraft";
import { mapWidgetExtrasToStep1Ids, mapWidgetServiceToBookingServiceId } from "@/lib/booking/bookingWidgetDraft";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { calculateHomeWidgetQuoteZar, type HomeWidgetQuoteInput } from "@/lib/pricing/calculatePrice";

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
  const totalPaidZar = await serverWidgetQuoteFromIntake(admin, intake);
  const serviceId = mapWidgetServiceToBookingServiceId(intake.service);
  const paystackReference = `widget_${crypto.randomUUID().replace(/-/g, "")}`;
  const extrasForRow = mapWidgetExtrasToStep1Ids(intake.extras);

  const row = {
    paystack_reference: paystackReference,
    customer_email: null as string | null,
    amount_paid_cents: 0,
    total_paid_cents: 0,
    base_amount_cents: 0,
    extras_amount_cents: 0,
    currency: "ZAR",
    booking_snapshot: {
      source: "homepage_widget",
      intake,
      serverTotalZar: totalPaidZar,
      pricingModel: "home_widget_v1",
    },
    status: "pending",
    dispatch_status: "searching",
    cleaner_response_status: CLEANER_RESPONSE.NONE,
    surge_multiplier: 1,
    service: getServiceLabel(serviceId),
    rooms: intake.bedrooms,
    bathrooms: intake.bathrooms,
    extras: extrasForRow,
    location: intake.location?.trim() || null,
    date: intake.date,
    time: intake.time,
    total_paid_zar: totalPaidZar,
    service_fee_cents: 0,
  };

  const { data, error } = await admin.from("bookings").insert(row).select("id").maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  const id = data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : "";
  if (!id) return { ok: false, error: "Insert returned no id." };
  return { ok: true, bookingId: id, paystackReference, totalPaidZar };
}
