import "server-only";

import {
  getServiceLabel,
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
  normalizeStep1ForService,
  parseBookingServiceId,
} from "@/components/booking/serviceCategories";
import { INITIAL_BOOKING_STEP1_STATE, type BookingStep1State } from "@/components/booking/useBookingStep1";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { insertPendingPaymentBookingRow } from "@/lib/booking/insertPendingPaymentBooking";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { buildSnapshotFlat, mergeSnapshotWithFlat } from "@/lib/booking/snapshotFlat";
import { getOrCreatePricingVersionId } from "@/lib/booking/pricingVersionDb";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import { buildPriceSnapshotV1Checkout } from "@/lib/booking/priceSnapshotBooking";
import { calculatePrice } from "@/lib/pricing/calculatePrice";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBookingLocationContext } from "@/lib/booking/resolveLocationId";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BookingFlowIntakeInput = {
  service: string;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  date: string;
  time: string;
  location: string;
  /** `public.locations.slug` (e.g. from marketing URL). */
  locationSlug?: string | null;
  /** Suburb picker — `public.locations.id`. */
  serviceAreaLocationId?: string | null;
  serviceAreaCityId?: string | null;
  /** Denormalized label from picker (stored on locked snapshot). */
  serviceAreaName?: string | null;
  /** Preferred cleaner (`cleaners.id`); assignment runs after payment. */
  selected_cleaner_id?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
};

export async function insertBookingFromFlowIntake(
  admin: SupabaseClient,
  input: BookingFlowIntakeInput,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const svc = parseBookingServiceId(input.service);
  if (!svc) return { ok: false, error: "Invalid service." };
  const date = String(input.date ?? "").trim();
  const time = String(input.time ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Invalid date." };
  if (!/^\d{1,2}:\d{2}$/.test(time)) return { ok: false, error: "Invalid time." };
  const loc = String(input.location ?? "").trim();
  const slugHint = input.locationSlug != null ? String(input.locationSlug).trim().toLowerCase() : "";
  const svcAreaIdRaw = input.serviceAreaLocationId != null ? String(input.serviceAreaLocationId).trim() : "";
  const svcAreaCityRaw = input.serviceAreaCityId != null ? String(input.serviceAreaCityId).trim() : "";
  const svcAreaId = UUID_RE.test(svcAreaIdRaw) ? svcAreaIdRaw.toLowerCase() : null;
  const svcAreaCity = UUID_RE.test(svcAreaCityRaw) ? svcAreaCityRaw.toLowerCase() : null;
  const svcAreaName = input.serviceAreaName != null ? String(input.serviceAreaName).trim().slice(0, 120) : "";

  if (loc.length < 3) return { ok: false, error: "Enter your street address (at least 3 characters)." };

  const email = normalizeEmail(input.customerEmail);
  if (!email) return { ok: false, error: "Invalid email." };
  const name = String(input.customerName ?? "").trim().slice(0, 200);
  const phone = String(input.customerPhone ?? "").trim().slice(0, 40);
  if (!name) return { ok: false, error: "Name is required." };
  if (!phone || phone.length < 7) return { ok: false, error: "Phone is required." };

  const snapshot = await buildPricingRatesSnapshotFromDb(admin);
  if (!snapshot) return { ok: false, error: "Pricing catalog unavailable." };

  const pv = await getOrCreatePricingVersionId(admin, snapshot);
  const pricingVersionId = pv?.id?.trim() ?? null;

  const { total: totalZar, hours } = calculatePrice(
    {
      service: svc,
      rooms: input.bedrooms,
      bathrooms: input.bathrooms,
      extraRooms: input.extraRooms,
      extras: Array.isArray(input.extras) ? input.extras : [],
    },
    snapshot,
  );

  if (!Number.isFinite(totalZar) || totalZar <= 0) return { ok: false, error: "Could not calculate price." };

  const group = inferServiceGroupFromServiceId(svc);
  const service_type = inferServiceTypeFromServiceId(svc);
  const rawExtras = Array.isArray(input.extras) ? input.extras : [];
  const extrasForSanitize: unknown[] = [];
  for (const raw of rawExtras) {
    if (typeof raw === "string") {
      const slug = raw.trim();
      if (!slug) continue;
      const row = snapshot.extras[slug];
      extrasForSanitize.push({
        slug,
        name: String(row?.name ?? slug).slice(0, 200),
        price: Math.round(row?.price ?? 0),
      });
    } else {
      extrasForSanitize.push(raw);
    }
  }
  const extrasSanitized = sanitizeBookingExtrasForPersist(extrasForSanitize, { where: "insertBookingFromFlowIntake" });

  const resolved = await resolveBookingLocationContext(admin, {
    location: loc,
    locationSlug: slugHint || null,
    serviceAreaLocationId: svcAreaId,
    serviceAreaCityId: svcAreaCity,
  });

  let serviceAreaNameOut = svcAreaName;
  if (!serviceAreaNameOut && resolved.locationId) {
    const { data: nmRow } = await admin.from("locations").select("name").eq("id", resolved.locationId).maybeSingle();
    if (nmRow && typeof nmRow === "object" && "name" in nmRow) {
      serviceAreaNameOut = String((nmRow as { name?: string }).name ?? "").trim().slice(0, 120);
    }
  }

  const displayLocation = [serviceAreaNameOut, loc].filter((x) => x.length > 0).join(" — ").slice(0, 500);

  const step1 = normalizeStep1ForService({
    ...INITIAL_BOOKING_STEP1_STATE,
    service: svc,
    service_type,
    service_group: group,
    selectedCategory: group,
    rooms: input.bedrooms,
    bathrooms: input.bathrooms,
    extraRooms: input.extraRooms,
    extras: extrasSanitized.map((e) => e.slug),
    location: displayLocation,
    serviceAreaLocationId: svcAreaId ?? resolved.locationId,
    serviceAreaCityId: svcAreaCity ?? resolved.cityId,
    serviceAreaName: serviceAreaNameOut,
    propertyType: "apartment",
    cleaningFrequency: "one_time",
    allowLocationTextFallback: true,
  }) as BookingStep1State;

  const lockedAt = new Date().toISOString();
  const locked: LockedBooking = {
    ...step1,
    date,
    time,
    finalPrice: Math.round(totalZar),
    finalHours: Number.isFinite(hours) ? hours : 0,
    surge: 1,
    locked: true,
    lockedAt,
    pricing_version_id: pricingVersionId,
  };

  const paystackReference = `pending_${crypto.randomUUID().replace(/-/g, "")}`;
  const ins = await insertPendingPaymentBookingRow(admin, {
    paystackReference,
    locked,
    customerEmail: email,
    locationId: resolved.locationId,
    cityId: resolved.cityId,
  });
  if (!ins.ok) return { ok: false, error: ins.error };

  const bookingId = ins.id;
  const rawSel =
    input.selected_cleaner_id != null && String(input.selected_cleaner_id).trim()
      ? String(input.selected_cleaner_id).trim()
      : null;
  const preferred = rawSel && UUID_RE.test(rawSel) ? rawSel : null;

  const flat = buildSnapshotFlat(locked);
  const snapBase: BookingSnapshotV1 = {
    v: 1,
    locked,
    total_zar: Math.round(totalZar),
    customer: {
      name,
      email,
      phone,
      user_id: null,
      type: "guest",
    },
  };
  const booking_snapshot = mergeSnapshotWithFlat(snapBase, flat);

  const price_breakdown = {
    source: "flow_intake",
    subtotalZar: Math.round(totalZar),
    hours,
    pricedAt: lockedAt,
  };

  const totalRounded = Math.round(totalZar);
  const extraLines = extrasSanitized.map((e) => ({
    id: e.slug,
    name: e.name,
    price: Math.round(e.price),
  }));
  const extrasSum = extraLines.reduce((s, e) => s + e.price, 0);
  const baseRounded = Math.max(0, totalRounded - extrasSum);
  const price_snapshot = buildPriceSnapshotV1Checkout({
    service_type: adminBookingServiceSlug(String(svc)),
    base_price: baseRounded,
    extras: extraLines,
    total_price: totalRounded,
  });

  const { error: upErr } = await admin
    .from("bookings")
    .update({
      customer_name: name,
      customer_phone: phone,
      total_price: totalRounded,
      extras: extrasSanitized,
      pricing_version_id: pricingVersionId,
      paystack_reference: bookingId,
      booking_snapshot,
      price_breakdown,
      price_snapshot,
      location: displayLocation,
      location_id: resolved.locationId,
      city_id: resolved.cityId,
      ...(preferred
        ? { selected_cleaner_id: preferred, assignment_type: "user_selected" as const, cleaner_id: null }
        : {}),
    })
    .eq("id", bookingId)
    .eq("status", "pending_payment");

  if (upErr) {
    await admin.from("bookings").delete().eq("id", bookingId).eq("status", "pending_payment");
    return { ok: false, error: upErr.message };
  }

  return { ok: true, bookingId };
}
