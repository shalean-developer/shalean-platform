import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCustomerPricingFromForm, pricingPersistFields } from "@/lib/booking-v2/buildCustomerPricingFromForm";
import { filterCustomerOnlineBookingTimeSlots } from "@/lib/booking-v2/customerBookingTimeSlots";
import { loadBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";
import { bookingCustomerOwnershipPatch } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import type { BookingV2ConfirmPayload } from "@/src/features/booking-v2/schemas";

export type LaunchCheckSeedResult =
  | { ok: true; bookingId: string; paystackReference: string; payload: BookingV2ConfirmPayload }
  | { ok: false; error: string };

function futureDateYmd(daysAhead: number): string {
  const d = new Date();
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + daysAhead);
  return dt.toISOString().slice(0, 10);
}

function pickTimeSlot(dateYmd: string): string {
  const slots = filterCustomerOnlineBookingTimeSlots(dateYmd);
  if (slots.length > 0) return slots[0]!;
  return "09:00";
}

export function buildLaunchCheckConfirmPayload(params: {
  pricingTotal: number;
  selectedCleanerId?: string | null;
}): BookingV2ConfirmPayload {
  const date = futureDateYmd(14 + Math.floor(Math.random() * 30));
  const time = pickTimeSlot(date);
  return {
    serviceSlug: "regular-cleaning",
    serviceDetails: { bedrooms: 2, bathrooms: 1, extraRooms: 0 },
    address: "42 Launch Check Street",
    suburb: "Sea Point",
    serviceAreaLocationId: "",
    serviceAreaCityId: "",
    city: "Cape Town",
    postalCode: "8005",
    accessInstructions: "",
    parkingInstructions: "",
    gateCode: "",
    contactPhone: "0821234567",
    selectedExtras: [],
    equipmentRequired: "no",
    equipmentQuote: null,
    bookingType: "once_off",
    date,
    time,
    alternativeDate: "",
    alternativeTime: "",
    recurringFrequency: "",
    recurringDays: [],
    recurringStartDate: "",
    recurringEndDate: "",
    cleanerMode: "individual_cleaners",
    assignedTeamId: "",
    cleanerCount: 1,
    selectedCleanerIds: params.selectedCleanerId ? [params.selectedCleanerId] : [],
    pricingSummary: {
      total: params.pricingTotal,
      estimated_total: params.pricingTotal,
    },
  };
}

/** Inserts a `pending_payment` row the same way booking-v2 confirm would (server-side). */
export async function seedLaunchCheckPendingPaymentBooking(
  admin: SupabaseClient,
  params: {
    userId: string;
    customerEmail: string;
    customerName?: string;
    selectedCleanerId?: string | null;
  },
): Promise<LaunchCheckSeedResult> {
  let serverBreakdown = buildCustomerPricingFromForm({
    serviceSlug: "regular-cleaning",
    values: {
      serviceDetails: { bedrooms: 2, bathrooms: 1, extraRooms: 0 },
      selectedExtras: [],
      cleanerMode: "individual_cleaners",
      cleanerCount: 1,
      bookingType: "once_off",
      recurringFrequency: "",
      equipmentRequired: "no",
      equipmentQuote: null,
    },
    liveConfig: null,
    feesConfig: null,
  });

  try {
    const { catalog, feesConfig } = await loadBookingV2Catalog();
    serverBreakdown = buildCustomerPricingFromForm({
      serviceSlug: "regular-cleaning",
      values: {
        serviceDetails: { bedrooms: 2, bathrooms: 1, extraRooms: 0 },
        selectedExtras: [],
        cleanerMode: "individual_cleaners",
        cleanerCount: 1,
        bookingType: "once_off",
        recurringFrequency: "",
        equipmentRequired: "no",
        equipmentQuote: null,
      },
      liveConfig: catalog["regular-cleaning"] ?? null,
      feesConfig,
    });
  } catch {
    /** static fallback pricing is fine for launch check */
  }

  const payload = buildLaunchCheckConfirmPayload({
    pricingTotal: serverBreakdown.estimated_total,
    selectedCleanerId: params.selectedCleanerId,
  });

  const persistPricing = pricingPersistFields(serverBreakdown);
  const paystackReference = `launchcheck_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);

  const priceSnapshot = {
    v: 1 as const,
    service_type: payload.serviceSlug,
    base_price: Math.round(serverBreakdown.base_service_price),
    extras: serverBreakdown.selected_extras.map((extra) => ({
      id: extra.extra_id,
      name: extra.name,
      price: extra.price,
    })),
    total_price: Math.round(serverBreakdown.estimated_total),
    server_computed_total: serverBreakdown.estimated_total,
  };

  const { data: inserted, error: insertErr } = await admin
    .from("bookings")
    .insert({
      ...bookingCustomerOwnershipPatch(params.userId, ownershipColumn),
      customer_email: params.customerEmail,
      customer_name: params.customerName?.trim() || "Launch Check Customer",
      customer_phone: payload.contactPhone,
      paystack_reference: paystackReference,
      service: payload.serviceSlug,
      service_slug: payload.serviceSlug,
      status: "pending_payment",
      payment_status: "pending",
      location: payload.address,
      suburb: payload.suburb,
      postal_code: payload.postalCode,
      date: payload.date,
      time: payload.time,
      booking_type: payload.bookingType,
      cleaner_mode: payload.cleanerMode,
      cleaner_count: payload.cleanerCount,
      selected_cleaner_id: params.selectedCleanerId ?? null,
      assignment_type: params.selectedCleanerId ? "user_selected" : null,
      service_details: payload.serviceDetails,
      selected_extras: payload.selectedExtras,
      ...persistPricing,
      price_snapshot: priceSnapshot,
      currency: "ZAR",
      booking_snapshot: {
        launchCheck: true,
        serviceSlug: payload.serviceSlug,
        serviceDetails: payload.serviceDetails,
        address: payload.address,
        suburb: payload.suburb,
        city: payload.city,
        date: payload.date,
        time: payload.time,
        confirmedAt: new Date().toISOString(),
      },
    })
    .select("id, booking_reference, status")
    .single();

  if (insertErr || !inserted?.id) {
    return { ok: false, error: insertErr?.message ?? "Could not insert launch-check booking." };
  }

  return {
    ok: true,
    bookingId: String(inserted.id),
    paystackReference,
    payload,
  };
}

export async function cleanupLaunchCheckBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  if (!bookingId) return;
  try {
    await admin.from("dispatch_offers").delete().eq("booking_id", bookingId);
    await admin.from("booking_cleaners").delete().eq("booking_id", bookingId);
    await admin.from("bookings").delete().eq("id", bookingId);
  } catch {
    /** best-effort cleanup */
  }
}

export async function loadBookingRowById(
  admin: SupabaseClient,
  bookingId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}
