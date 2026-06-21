import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { bookingV2ConfirmSchema } from "@/src/features/booking-v2/schemas";
import {
  TEAM_SERVICES,
  MAX_TEAM_BOOKINGS_PER_DAY,
} from "@/src/features/booking-v2/config/serviceConfig";
import { buildCustomerPricingFromForm, pricingPersistFields } from "@/lib/booking-v2/buildCustomerPricingFromForm";
import { loadBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";
import type { LiveServiceConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";
import {
  buildEquipmentPricingSnapshot,
  equipmentPersistFields,
  quoteEquipmentForAddress,
  type EquipmentQuoteResult,
} from "@/lib/booking-v2/equipmentPricing";
import { loadEquipmentPricingConfig } from "@/lib/booking-v2/loadEquipmentPricingConfig";
import { serviceShowsEquipmentQuestion } from "@/src/features/booking-v2/config/serviceConfig";
import { resolveCustomerPhoneFromAuthAdmin, trimCustomerPhone } from "@/lib/admin/adminBookingCustomerContact";
import { bookingCustomerOwnershipPatch } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";

export const runtime = "nodejs";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Saves the property address captured in Step 1 of the booking flow to the
 * customer's saved addresses (shown on /account/addresses). Idempotent: skips
 * when an address with the same street + suburb already exists for the user, and
 * only marks it as the default property when the customer has none saved yet.
 */
async function saveBookingAddressToAccount(
  supabase: SupabaseAdmin,
  args: { userId: string; line1: string; suburb: string; city: string; postalCode: string },
): Promise<void> {
  const line1 = args.line1?.trim() ?? "";
  const suburb = args.suburb?.trim() ?? "";
  if (!line1 || !suburb) return;

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("customer_saved_addresses")
      .select("id, line1, suburb")
      .eq("user_id", args.userId);

    if (fetchErr) {
      console.warn("[booking-v2/confirm] save address lookup failed:", fetchErr.message);
      return;
    }

    const rows = existing ?? [];
    const alreadySaved = rows.some(
      (r) =>
        (r.line1 ?? "").trim().toLowerCase() === line1.toLowerCase() &&
        (r.suburb ?? "").trim().toLowerCase() === suburb.toLowerCase(),
    );
    if (alreadySaved) return;

    const isFirst = rows.length === 0;
    const { error: insertErr } = await supabase.from("customer_saved_addresses").insert({
      user_id: args.userId,
      label: isFirst ? "Home" : suburb,
      line1,
      suburb,
      city: args.city?.trim() || "Cape Town",
      postal_code: args.postalCode?.trim() || "",
      is_default: isFirst,
      updated_at: new Date().toISOString(),
    });

    if (insertErr) {
      console.warn("[booking-v2/confirm] save address insert failed:", insertErr.message);
    }
  } catch (e) {
    console.warn("[booking-v2/confirm] save address error:", e);
  }
}

export async function POST(request: Request) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind === "anonymous") {
    return NextResponse.json(
      { error: "You must be signed in to confirm a booking." },
      { status: 401 },
    );
  }

  const { userId, email } = auth;

  // ── 2. Validate payload ───────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bookingV2ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return NextResponse.json(
      { error: firstError?.message ?? "Invalid booking data." },
      { status: 422 },
    );
  }

  // Mutable copy so we can override pricingSummary.total after server-side verification
  const data = { ...parsed.data, pricingSummary: { ...parsed.data.pricingSummary } };

  // ── 3. Supabase admin ─────────────────────────────────────────────────────────
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  const ownershipColumn = await resolveBookingOwnershipColumn(supabase);

  // ── 4. Team availability re-check (race protection) ───────────────────────────
  if (data.cleanerMode === "team") {
    if (!data.assignedTeamId) {
      return NextResponse.json({ error: "Select a team." }, { status: 422 });
    }

    const isTeamService = TEAM_SERVICES.includes(data.serviceSlug as (typeof TEAM_SERVICES)[number]);
    if (!isTeamService) {
      return NextResponse.json(
        { error: "This service does not support team mode." },
        { status: 422 },
      );
    }

    const { data: existing, error: teamErr } = await supabase
      .from("bookings")
      .select("id, assigned_team_id")
      .eq("date", data.date)
      .in("service", ["deep-cleaning", "moving-cleaning"])
      .not("status", "in", '("cancelled","refunded")');

    if (teamErr) {
      return NextResponse.json({ error: "Could not verify team availability." }, { status: 500 });
    }

    const total = (existing ?? []).length;
    if (total >= MAX_TEAM_BOOKINGS_PER_DAY) {
      return NextResponse.json(
        { error: "No team slots available for this date. Please choose another date." },
        { status: 409 },
      );
    }

    const teamAlreadyBooked = (existing ?? []).some(
      (row) => row.assigned_team_id === data.assignedTeamId,
    );
    if (teamAlreadyBooked) {
      return NextResponse.json(
        { error: `${data.assignedTeamId} is already booked for this date. Please select another team or date.` },
        { status: 409 },
      );
    }
  }

  // ── 5. Resolve customer name from user_profiles ──────────────────────────────
  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const customerName: string = profileRow?.full_name ?? "";

  const customerPhoneFromAuth = await resolveCustomerPhoneFromAuthAdmin(supabase, userId);
  const customerPhone = trimCustomerPhone(data.contactPhone) ?? customerPhoneFromAuth;

  // ── 6. Server-side price verification ────────────────────────────────────────
  const equipmentRequiredFlag = data.equipmentRequired === "yes";
  let liveConfig: LiveServiceConfig | null = null;
  let feesConfig: Awaited<ReturnType<typeof loadBookingV2Catalog>>["feesConfig"] | null = null;
  let serverEquipmentQuote: EquipmentQuoteResult | null = null;
  let equipmentPricingSnapshot: ReturnType<typeof buildEquipmentPricingSnapshot> | null = null;

  let serverBreakdown = buildCustomerPricingFromForm({
    serviceSlug: data.serviceSlug,
    values: {
      serviceDetails: data.serviceDetails as Record<string, string | number | boolean>,
      selectedExtras: data.selectedExtras ?? [],
      cleanerMode: data.cleanerMode,
      cleanerCount: data.cleanerCount ?? 1,
      bookingType: data.bookingType,
      recurringFrequency: data.recurringFrequency ?? "",
      equipmentRequired: data.equipmentRequired ?? "",
      equipmentQuote: (data.equipmentQuote as EquipmentQuoteResult | null) ?? null,
    },
    liveConfig: null,
    feesConfig: null,
  });

  try {
    const catalogPayload = await loadBookingV2Catalog();
    feesConfig = catalogPayload.feesConfig;
    liveConfig = catalogPayload.catalog[data.serviceSlug] ?? null;

    const showEquipment =
      liveConfig?.showEquipmentQuestion ??
      liveConfig?.showCleaningProductsQuestion ??
      serviceShowsEquipmentQuestion(data.serviceSlug);

    if (showEquipment && equipmentRequiredFlag) {
      const equipConfig = await loadEquipmentPricingConfig();
      serverEquipmentQuote = await quoteEquipmentForAddress({
        config: equipConfig,
        address: data.address,
        suburb: data.suburb,
        city: data.city,
        postalCode: data.postalCode,
        equipmentRequired: true,
      });
      equipmentPricingSnapshot = buildEquipmentPricingSnapshot({
        config: equipConfig,
        quote: serverEquipmentQuote,
      });
    }

    serverBreakdown = buildCustomerPricingFromForm({
      serviceSlug: data.serviceSlug,
      values: {
        serviceDetails: data.serviceDetails as Record<string, string | number | boolean>,
        selectedExtras: data.selectedExtras ?? [],
        cleanerMode: data.cleanerMode,
        cleanerCount: data.cleanerCount ?? 1,
        bookingType: data.bookingType,
        recurringFrequency: data.recurringFrequency ?? "",
        equipmentRequired: equipmentRequiredFlag ? "yes" : data.equipmentRequired === "no" ? "no" : "",
        equipmentQuote: serverEquipmentQuote,
      },
      liveConfig,
      feesConfig,
    });
  } catch (e) {
    console.warn("[booking-v2/confirm] server price check failed:", e);
  }

  const equipmentPersist = equipmentPersistFields({
    equipmentRequired: equipmentRequiredFlag,
    quote: serverEquipmentQuote,
    pricingSnapshot: equipmentPricingSnapshot,
  });

  const clientTotal =
    (data.pricingSummary as { estimated_total?: number }).estimated_total ??
    data.pricingSummary.total;
  const serverTotal = serverBreakdown.estimated_total;

  if (serverTotal > 0) {
    const drift = Math.abs(serverTotal - clientTotal) / serverTotal;
    if (drift > 0.01) {
      console.warn(
        `[booking-v2/confirm] price drift: client R${clientTotal} vs server R${serverTotal} (${(drift * 100).toFixed(1)}%) — overriding`,
      );
    }
    data.pricingSummary = serverBreakdown;
  }

  const persistPricing = pricingPersistFields(serverBreakdown);

  // ── 7. Generate Paystack reference ────────────────────────────────────────────
  const paystackReference = `bv2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // ── 8. Build price_snapshot (required by bookings_price_snapshot_required_check) ──
  const priceSnapshot = {
    v: 1 as const,
    service_type: data.serviceSlug,
    base_price: Math.round(serverBreakdown.base_service_price),
    extras: serverBreakdown.selected_extras.map((extra) => ({
      id: extra.extra_id,
      name: extra.name,
      price: extra.price,
    })),
    total_price: Math.round(serverBreakdown.estimated_total),
    server_computed_total: serverBreakdown.estimated_total,
  };

  // ── 9. Reuse an existing pending_payment booking for the same slot (retry path) ──
  // The unique index idx_bookings_unique_active_customer_slot prevents duplicate inserts
  // for (user_id, date, time, service_slug) when status != cancelled/failed/payment_expired.
  const { data: existingBooking } = await supabase
    .from("bookings")
    .select("id, paystack_reference")
    .eq(ownershipColumn, userId)
    .eq("date", data.date)
    .eq("time", data.time)
    .eq("service_slug", data.serviceSlug)
    .eq("status", "pending_payment")
    .eq("slot_duplicate_exempt", false)
    .maybeSingle();

  if (existingBooking?.id) {
    const { error: updateErr } = await supabase
      .from("bookings")
      .update({
        paystack_reference: paystackReference,
        customer_phone: customerPhone,
        ...persistPricing,
        ...equipmentPersist,
        price_snapshot: priceSnapshot,
      })
      .eq("id", existingBooking.id);

    if (updateErr) {
      console.error("[booking-v2/confirm] update existing booking error:", updateErr.message);
      return NextResponse.json(
        { error: "Could not save your booking. Please try again." },
        { status: 500 },
      );
    }

    await saveBookingAddressToAccount(supabase, {
      userId,
      line1: data.address,
      suburb: data.suburb,
      city: data.city,
      postalCode: data.postalCode,
    });

    return NextResponse.json({
      success: true,
      bookingId: existingBooking.id,
      paystackReference,
    });
  }

  // ── 9. Insert booking row ─────────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      // Core identity
      ...bookingCustomerOwnershipPatch(userId, ownershipColumn),
      customer_email: email,
      customer_name: customerName,
      customer_phone: customerPhone,
      paystack_reference: paystackReference,

      // Service
      service: data.serviceSlug,
      service_slug: data.serviceSlug,

      // Status
      status: "pending_payment",
      payment_status: "pending",

      // Location
      location: data.address,
      suburb: data.suburb,
      postal_code: data.postalCode,
      access_instructions: data.accessInstructions || null,
      parking_instructions: data.parkingInstructions || null,
      gate_code: data.gateCode || null,

      // Schedule
      date: data.date,
      time: data.time,
      alt_date: data.alternativeDate || null,
      alt_time: data.alternativeTime || null,
      booking_type: data.bookingType,
      recurring_frequency: data.recurringFrequency || null,
      recurring_days: data.recurringDays?.length ? data.recurringDays : null,
      recurring_start_date: data.recurringStartDate || null,
      recurring_end_date: data.recurringEndDate || null,

      // Cleaner / team
      cleaner_mode: data.cleanerMode,
      assigned_team_id: data.cleanerMode === "team" ? data.assignedTeamId : null,
      cleaner_count: data.cleanerMode === "individual_cleaners" ? data.cleanerCount : null,
      // Save first selected cleaner preference for dispatch
      selected_cleaner_id:
        data.cleanerMode === "individual_cleaners" && data.selectedCleanerIds?.length
          ? data.selectedCleanerIds[0]
          : null,
      assignment_type:
        data.cleanerMode === "individual_cleaners" && data.selectedCleanerIds?.length
          ? "user_selected"
          : null,

      // Service-specific
      service_details: data.serviceDetails,
      selected_extras: data.selectedExtras,

      // Pricing
      ...persistPricing,
      ...equipmentPersist,
      price_snapshot: priceSnapshot,
      currency: "ZAR",

      // Snapshot for history
      booking_snapshot: {
        serviceSlug: data.serviceSlug,
        serviceDetails: data.serviceDetails,
        address: data.address,
        suburb: data.suburb,
        city: data.city,
        date: data.date,
        time: data.time,
        cleanerMode: data.cleanerMode,
        cleanerCount: data.cleanerCount,
        assignedTeamId: data.assignedTeamId,
        selectedExtras: data.selectedExtras,
        equipmentRequired: data.equipmentRequired,
        equipmentQuote: serverEquipmentQuote,
        pricingSummary: serverBreakdown,
        contactPhone: customerPhone,
        customer: {
          name: customerName || null,
          email,
          phone: customerPhone,
        },
        confirmedAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    console.error("[booking-v2/confirm] insert error:", insertErr?.message, insertErr?.code);
    return NextResponse.json(
      { error: "Could not save your booking. Please try again." },
      { status: 500 },
    );
  }

  await saveBookingAddressToAccount(supabase, {
    userId,
    line1: data.address,
    suburb: data.suburb,
    city: data.city,
    postalCode: data.postalCode,
  });

  return NextResponse.json({
    success: true,
    bookingId: inserted.id,
    paystackReference,
  });
}
