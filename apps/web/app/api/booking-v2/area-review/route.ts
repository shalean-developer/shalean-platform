import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { bookingCustomerOwnershipPatch } from "@/lib/booking/bookingCustomerIdentity";
import {
  loadBookingV2LocationContextById,
  resolveBookingV2LocationContext,
} from "@/lib/booking-v2/bookingV2LocationContext";
import { assessBookingV2SlotFulfillment } from "@/lib/booking-v2/bookingV2SlotEligibility";
import { isBookingSoftFulfillmentEnabled } from "@/lib/booking/availabilityFlags";
import { logBookingDemandEvent } from "@/lib/booking/logBookingDemandEvent";
import { SOFT_FULFILLMENT_CUSTOMER_COPY } from "@/lib/booking/bookingFulfillmentMode";
import { notifyOfficeSoftFulfillment } from "@/lib/notifications/notifyOfficeSoftFulfillment";
import { resolveCustomerPhoneFromAuthAdmin, trimCustomerPhone } from "@/lib/admin/adminBookingCustomerContact";
import { canonicalServiceSlugFromBookingV2 } from "@/lib/booking-v2/bookingV2ServiceSlug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const areaReviewSchema = z.object({
  serviceSlug: z.string().min(1),
  address: z.string().min(1),
  suburb: z.string().min(1),
  city: z.string().optional().default(""),
  postalCode: z.string().optional().default(""),
  serviceAreaLocationId: z.string().uuid().optional().nullable(),
  serviceAreaCityId: z.string().uuid().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(4),
  contactPhone: z.string().optional().default(""),
  serviceDetails: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  notes: z.string().optional().default(""),
});

export async function POST(request: Request) {
  if (!isBookingSoftFulfillmentEnabled()) {
    return NextResponse.json({ error: "Area review is not enabled." }, { status: 403 });
  }

  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = auth.userId;
  const email = auth.email;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = areaReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid area review request." }, { status: 422 });
  }
  const data = parsed.data;
  const timeHm = data.time.trim().slice(0, 5);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  const ownershipColumn = await resolveBookingOwnershipColumn(supabase);

  let locationCtx = null as Awaited<ReturnType<typeof resolveBookingV2LocationContext>> | null;
  if (data.serviceAreaLocationId) {
    locationCtx = await loadBookingV2LocationContextById(supabase, data.serviceAreaLocationId);
  }
  if (!locationCtx) {
    locationCtx = await resolveBookingV2LocationContext(supabase, data.suburb);
  }

  if (locationCtx) {
    const assessment = await assessBookingV2SlotFulfillment(supabase, {
      serviceSlug: data.serviceSlug,
      date: data.date,
      time: timeHm,
      location: locationCtx,
      serviceDetails: data.serviceDetails,
    });
    if (assessment.mode !== "area_review") {
      return NextResponse.json(
        {
          error: "This slot can be reserved with payment instead.",
          code: "USE_PAID_RESERVE",
          fulfillmentMode: assessment.mode,
          customerMessage: assessment.customerMessage,
        },
        { status: 409 },
      );
    }
  }

  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const customerName: string = profileRow?.full_name ?? "";
  const customerPhoneFromAuth = await resolveCustomerPhoneFromAuthAdmin(supabase, userId);
  const customerPhone = trimCustomerPhone(data.contactPhone) ?? customerPhoneFromAuth;
  const canonicalServiceSlug = canonicalServiceSlugFromBookingV2(data.serviceSlug);
  const paystackReference = `area-review-${crypto.randomUUID()}`;

  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      ...bookingCustomerOwnershipPatch(userId, ownershipColumn),
      customer_email: email,
      customer_name: customerName,
      customer_phone: customerPhone,
      paystack_reference: paystackReference,
      service: data.serviceSlug,
      service_slug: canonicalServiceSlug,
      status: "area_review",
      payment_status: "pending",
      dispatch_status: null,
      fulfillment_mode: "area_review",
      fulfillment_reason: "no_active_cleaner_coverage",
      location: data.address,
      suburb: data.suburb,
      postal_code: data.postalCode || null,
      location_id: locationCtx?.locationId ?? null,
      city_id: locationCtx?.cityId ?? data.serviceAreaCityId ?? null,
      latitude: locationCtx?.latitude ?? null,
      longitude: locationCtx?.longitude ?? null,
      date: data.date,
      time: timeHm,
      amount_paid_cents: 0,
      total_paid_zar: 0,
      total_price: 0,
      currency: "ZAR",
      service_details: data.serviceDetails ?? {},
      booking_snapshot: {
        serviceSlug: data.serviceSlug,
        address: data.address,
        suburb: data.suburb,
        city: data.city,
        date: data.date,
        time: timeHm,
        fulfillmentMode: "area_review",
        notes: data.notes || null,
        customer: { name: customerName || null, email, phone: customerPhone },
        createdAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    console.error("[booking-v2/area-review] insert:", insertErr?.message);
    return NextResponse.json({ error: "Could not save your request. Please try again." }, { status: 500 });
  }

  void logBookingDemandEvent(supabase, {
    eventType: "area_review_started",
    suburb: data.suburb,
    city: data.city,
    postalCode: data.postalCode,
    locationId: locationCtx?.locationId ?? null,
    serviceSlug: data.serviceSlug,
    requestedDate: data.date,
    requestedTime: timeHm,
    fulfillmentMode: "area_review",
    bookingId: inserted.id,
    userId,
    source: "web_v2_area_review",
  });

  void notifyOfficeSoftFulfillment({
    supabase,
    bookingId: inserted.id,
    kind: "area_review",
    suburb: data.suburb,
    dateYmd: data.date,
    timeHm,
    serviceSlug: data.serviceSlug,
    customerName,
    customerEmail: email,
    customerPhone,
  });

  return NextResponse.json({
    success: true,
    bookingId: inserted.id,
    fulfillmentMode: "area_review",
    requiresPayment: false,
    customerMessage: SOFT_FULFILLMENT_CUSTOMER_COPY.areaReview,
  });
}
