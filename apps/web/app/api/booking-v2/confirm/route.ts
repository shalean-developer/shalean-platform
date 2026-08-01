import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { bookingV2ConfirmSchema } from "@/src/features/booking-v2/schemas";
import { TEAM_SERVICES } from "@/src/features/booking-v2/config/serviceConfig";
import { loadDispatchTeamsForBooking } from "@/lib/dispatch/loadDispatchTeamsForBooking";
import { pricingPersistFields } from "@/lib/booking-v2/buildCustomerPricingFromForm";
import { buildSignedCustomerPricingFromForm } from "@/lib/booking-v2/buildSignedCustomerPricingFromForm";
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
import {
  loadBookingV2LocationContextById,
  resolveBookingV2LocationContext,
  type BookingV2LocationContext,
} from "@/lib/booking-v2/bookingV2LocationContext";
import {
  preferredCleanerAssignmentFields,
  preferredCleanerInsertExtras,
} from "@/lib/booking/persistPreferredCleaners";
import { validatePreferredCleanersForSlot } from "@/lib/booking/validatePreferredCleanersForSlot";
import {
  assessBookingV2SlotFulfillment,
} from "@/lib/booking-v2/bookingV2SlotEligibility";
import { isBookingSoftFulfillmentEnabled } from "@/lib/booking/availabilityFlags";
import { logBookingDemandEvent } from "@/lib/booking/logBookingDemandEvent";
import { SOFT_FULFILLMENT_CUSTOMER_COPY } from "@/lib/booking/bookingFulfillmentMode";
import type { BookingFulfillmentMode } from "@/lib/booking/bookingFulfillmentMode";
import { canonicalServiceSlugFromBookingV2 } from "@/lib/booking-v2/bookingV2ServiceSlug";
import { spendCleaningCredit } from "@/lib/referrals/credits";
import { buildReferralCheckoutSnapshot } from "@/lib/referrals/referralCheckoutMetadata";
import { buildReferralCheckoutFingerprint } from "@/lib/referrals/checkoutFingerprint";
import { resolveReferralClientIp } from "@/lib/referrals/clientIp";
import { validateReferralForCheckout } from "@/lib/referrals/validateReferral";
import { getPaystackPublicKey } from "@/lib/payments/paystackPublicKey";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import { assertV2ConfirmQuoteIntegrity } from "@/lib/booking/quote/validateBookingV2Quote";
import type { CustomerPricingBreakdown, CustomerTotalInput } from "@/lib/booking-v2/types";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import {
  applyPromotionRedemptions,
  evaluateCheckoutPromotions,
  getCompletedBookingCount,
  getActiveMembershipDiscountPercent,
} from "@/lib/promotions/server";
import type { AppliedPromotionDiscount } from "@/lib/promotions/types";
import { resolveCheckoutPromoEligibilityExtras } from "@/lib/promotions/resolveCheckoutPromoEligibilityExtras";
import { bookingUncollectedCashColumns } from "@/lib/booking/bookingPaidAmountColumns";
import { settleFullyCoveredBooking } from "@/lib/payments/settleFullyCoveredBooking";

export const runtime = "nodejs";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function trySettleFullyCoveredOrError(
  supabase: SupabaseAdmin,
  bookingId: string,
  payAmountZar: number,
): Promise<{ requiresPayment: true } | { requiresPayment: false } | { errorResponse: NextResponse }> {
  if (payAmountZar > 0) return { requiresPayment: true };
  const settled = await settleFullyCoveredBooking(supabase, { bookingId, payAmountZar });
  if (!settled.ok) {
    console.error("[booking-v2/confirm] R0 settlement failed:", settled.error, settled.code);
    return {
      errorResponse: NextResponse.json(
        { error: "Could not complete zero-balance settlement. Please try again or contact support." },
        { status: 503 },
      ),
    };
  }
  return { requiresPayment: false };
}

async function resolveConfirmLocationContext(
  supabase: SupabaseAdmin,
  data: {
    suburb: string;
    serviceAreaLocationId?: string;
    serviceAreaCityId?: string;
    equipmentQuote?: EquipmentQuoteResult | null;
  },
): Promise<BookingV2LocationContext | null> {
  const clientLocId = data.serviceAreaLocationId?.trim() ?? "";
  let ctx: BookingV2LocationContext | null = null;

  // Prefer the structured location id from Details (same id used for available-cleaners).
  if (clientLocId && UUID_RE.test(clientLocId)) {
    ctx = await loadBookingV2LocationContextById(supabase, clientLocId);
    if (ctx && data.serviceAreaCityId?.trim() && UUID_RE.test(data.serviceAreaCityId.trim())) {
      ctx = { ...ctx, cityId: ctx.cityId ?? data.serviceAreaCityId.trim() };
    }
  }
  if (!ctx) {
    ctx = await resolveBookingV2LocationContext(supabase, data.suburb);
  }
  if (!ctx) return null;

  // Prefer equipment-quote geocode when the service-area row has no coordinates.
  if (ctx.latitude == null || ctx.longitude == null) {
    const eqLat = data.equipmentQuote?.customer_latitude;
    const eqLng = data.equipmentQuote?.customer_longitude;
    if (typeof eqLat === "number" && typeof eqLng === "number" && Number.isFinite(eqLat) && Number.isFinite(eqLng)) {
      return { ...ctx, latitude: eqLat, longitude: eqLng };
    }
  }
  return ctx;
}

function locationPersistFields(ctx: BookingV2LocationContext) {
  return {
    location_id: ctx.locationId,
    city_id: ctx.cityId,
    ...(ctx.latitude != null && ctx.longitude != null
      ? { latitude: ctx.latitude, longitude: ctx.longitude }
      : {}),
  };
}

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
  const customerEmailNormalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  const customerEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmailNormalized);

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

    const teamLoad = await loadDispatchTeamsForBooking(supabase, {
      dateYmd: data.date,
      serviceSlug: data.serviceSlug,
    });
    if (teamLoad.error) {
      return NextResponse.json({ error: "Could not verify team availability." }, { status: 500 });
    }

    const picked = teamLoad.teams.find((t) => t.id === data.assignedTeamId);
    if (!picked) {
      return NextResponse.json({ error: "Selected team was not found. Refresh and try again." }, { status: 422 });
    }
    if (!picked.available) {
      if (!isBookingSoftFulfillmentEnabled()) {
        const reason = teamLoad.platformAtCapacity
          ? "No team slots available for this date. Please choose another date."
          : `${picked.name} is not available for this date. Please select another team or date.`;
        return NextResponse.json({ error: reason }, { status: 409 });
      }
      // Soft path: keep team preference; ops will confirm capacity.
    }
  }

  // ── 5. Resolve customer name from user_profiles ──────────────────────────────
  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("full_name, tier")
    .eq("id", userId)
    .maybeSingle();

  const customerName: string = profileRow?.full_name ?? "";
  const vipTier =
    profileRow && typeof (profileRow as { tier?: unknown }).tier === "string"
      ? String((profileRow as { tier: string }).tier)
      : null;

  const customerPhoneFromAuth = await resolveCustomerPhoneFromAuthAdmin(supabase, userId);
  const customerPhone = trimCustomerPhone(data.contactPhone) ?? customerPhoneFromAuth;

  // ── 6. Server-side price verification ────────────────────────────────────────
  const equipmentRequiredFlag = data.equipmentRequired === "yes";
  let liveConfig: LiveServiceConfig | null = null;
  let feesConfig: Awaited<ReturnType<typeof loadBookingV2Catalog>>["feesConfig"] | null = null;
  let serverEquipmentQuote: EquipmentQuoteResult | null = null;
  let equipmentPricingSnapshot: ReturnType<typeof buildEquipmentPricingSnapshot> | null = null;

  let catalogLoaded = false;
  let serverBreakdown = buildSignedCustomerPricingFromForm({
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
    vipTier,
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

    serverBreakdown = buildSignedCustomerPricingFromForm({
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
      vipTier,
    });
    catalogLoaded = true;
  } catch (e) {
    console.warn("[booking-v2/confirm] server price check failed:", e);
  }

  const quoteInput: CustomerTotalInput & { serviceSlug: ServiceSlug } = {
    serviceSlug: data.serviceSlug,
    serviceLabel: liveConfig?.label ?? data.serviceSlug,
    serviceDetails: data.serviceDetails as Record<string, string | number | boolean>,
    selectedExtras: data.selectedExtras ?? [],
    cleanerMode: data.cleanerMode,
    cleanerCount: data.cleanerCount ?? 1,
    bookingType: data.bookingType,
    recurringFrequency: data.recurringFrequency ?? "",
    catalog: {
      basePrice: liveConfig?.basePrice ?? 0,
      pricePerBedroom: liveConfig?.pricePerBedroom ?? 0,
      pricePerBathroom: liveConfig?.pricePerBathroom ?? 0,
      pricePerExtraRoom: liveConfig?.pricePerExtraRoom ?? 0,
      pricePerExtraCleaner: liveConfig?.pricePerExtraCleaner ?? 0,
      estimatedDurationHours: liveConfig?.estimatedDurationHours ?? 3,
      minDurationHours: liveConfig?.minDurationHours ?? 3.5,
      maxDurationHours: liveConfig?.maxDurationHours ?? 8,
      extras: liveConfig?.extras ?? [],
      allowsExtraCleaner: liveConfig?.allowsExtraCleaner,
      showEquipmentQuestion: liveConfig?.showEquipmentQuestion,
    },
    feesConfig: feesConfig ?? defaultBookingV2FeesConfig(),
    equipmentRequired: equipmentRequiredFlag,
    equipmentQuote: serverEquipmentQuote,
    vipTier,
  };

  const clientPricingSummary = parsed.data.pricingSummary as CustomerPricingBreakdown & { total?: number };
  const quoteValidation = assertV2ConfirmQuoteIntegrity({
    serverBreakdown,
    catalogLoaded,
    clientPricingSummary,
    quoteInput,
  });
  // Soft failures = client's cached quote is stale. Proceed with server-authoritative
  // pricing so customers are not blocked; Paystack charges the recomputed amount.
  if (!quoteValidation.ok && !quoteValidation.soft) {
    console.error("[booking-v2/confirm] quote validation failed:", quoteValidation.code);
    return NextResponse.json({ error: quoteValidation.error }, { status: quoteValidation.status });
  }
  if (!quoteValidation.ok && quoteValidation.soft) {
    console.warn(
      "[booking-v2/confirm] stale client quote accepted; using server pricing:",
      quoteValidation.code,
    );
  }

  data.pricingSummary = serverBreakdown!;

  const equipmentPersist = equipmentPersistFields({
    equipmentRequired: equipmentRequiredFlag,
    quote: serverEquipmentQuote,
    pricingSnapshot: equipmentPricingSnapshot,
  });

  const clientTotal =
    (parsed.data.pricingSummary as { estimated_total?: number }).estimated_total ??
    parsed.data.pricingSummary.total;

  const timeHm = data.time.trim().slice(0, 5);
  const canonicalServiceSlug = canonicalServiceSlugFromBookingV2(data.serviceSlug);
  const durationMinutes = serverBreakdown!.estimated_duration_minutes;

  const persistPricingBase = pricingPersistFields(serverBreakdown!, {
    date: data.date,
    time: timeHm,
  });

  const locationCtx = await resolveConfirmLocationContext(supabase, {
    suburb: data.suburb,
    serviceAreaLocationId: data.serviceAreaLocationId,
    serviceAreaCityId: data.serviceAreaCityId,
    equipmentQuote: serverEquipmentQuote ?? (data.equipmentQuote as EquipmentQuoteResult | null),
  });

  if (!locationCtx) {
    return NextResponse.json(
      {
        error:
          "We could not match your suburb to a service area. Choose a suburb from the list or contact us to book.",
      },
      { status: 422 },
    );
  }

  // Coordinates improve dispatch routing but must not block checkout when the
  // suburb already maps to a known service area (location_id / city_id).
  if (locationCtx.latitude == null || locationCtx.longitude == null) {
    console.warn(
      "[booking-v2/confirm] service area missing coordinates; proceeding without lat/lng:",
      locationCtx.locationId,
    );
  }

  let preferredCleanerIds: string[] = [];
  let preferredExtras = preferredCleanerInsertExtras([]);
  let fulfillmentMode: BookingFulfillmentMode = "instant";
  let fulfillmentReason = "eligible_cleaner_available";
  let fulfillmentCustomerMessage = "";

  if (data.cleanerMode === "individual_cleaners") {
    const assessment = await assessBookingV2SlotFulfillment(supabase, {
      serviceSlug: data.serviceSlug,
      date: data.date,
      time: timeHm,
      location: locationCtx,
      serviceDetails: data.serviceDetails as Record<string, string | number | boolean>,
      durationMinutes,
    });
    fulfillmentMode = assessment.mode;
    fulfillmentReason = assessment.reason;
    fulfillmentCustomerMessage = assessment.customerMessage;

    if (assessment.mode === "area_review") {
      void logBookingDemandEvent(supabase, {
        eventType: "slot_exhausted",
        suburb: data.suburb,
        city: data.city,
        postalCode: data.postalCode,
        locationId: locationCtx.locationId,
        serviceSlug: data.serviceSlug,
        requestedDate: data.date,
        requestedTime: timeHm,
        fulfillmentMode: "area_review",
        userId,
        source: "web_v2_confirm",
        metadata: { reason: assessment.reason },
      });
      return NextResponse.json(
        {
          error: assessment.customerMessage || SOFT_FULFILLMENT_CUSTOMER_COPY.areaReview,
          code: "AREA_REVIEW_REQUIRED",
          fulfillmentMode: "area_review",
          requiresPayment: false,
          customerMessage: assessment.customerMessage || SOFT_FULFILLMENT_CUSTOMER_COPY.areaReview,
        },
        { status: 409 },
      );
    }

    if (assessment.mode === "instant") {
      // Keep preferred cleaner validation on the instant path only.
      const preferredValidation = await validatePreferredCleanersForSlot({
        admin: supabase,
        selectedCleanerIds: data.selectedCleanerIds ?? [],
        maxSelect: data.cleanerCount,
        date: data.date,
        timeHm,
        durationMinutes,
        locationId: locationCtx.locationId,
        serviceType: canonicalServiceSlug,
      });
      if (!preferredValidation.ok) {
        return NextResponse.json({ error: preferredValidation.error }, { status: 409 });
      }
      preferredCleanerIds = preferredValidation.ids;
      preferredExtras = preferredCleanerInsertExtras(preferredCleanerIds);
    } else {
      // ops_assignment: drop preferred cleaners that are not slot-eligible; reserve without preference.
      preferredCleanerIds = [];
      preferredExtras = preferredCleanerInsertExtras([]);
      void logBookingDemandEvent(supabase, {
        eventType: "ops_reserve_started",
        suburb: data.suburb,
        city: data.city,
        postalCode: data.postalCode,
        locationId: locationCtx.locationId,
        serviceSlug: data.serviceSlug,
        requestedDate: data.date,
        requestedTime: timeHm,
        fulfillmentMode: "ops_assignment",
        userId,
        source: "web_v2_confirm",
        metadata: { reason: assessment.reason, opsCount: assessment.opsCount },
      });
    }
  } else if (data.cleanerMode === "team" && isBookingSoftFulfillmentEnabled()) {
    // If team was unavailable we still reach here; mark as ops reserve for the queue.
    const teamLoad = await loadDispatchTeamsForBooking(supabase, {
      dateYmd: data.date,
      serviceSlug: data.serviceSlug,
    });
    const picked = teamLoad.teams.find((t) => t.id === data.assignedTeamId);
    if (picked && !picked.available) {
      fulfillmentMode = "ops_assignment";
      fulfillmentReason = "team_capacity_ops_reserve";
      fulfillmentCustomerMessage = SOFT_FULFILLMENT_CUSTOMER_COPY.opsAssignment;
    }
  }

  const locationFields = locationPersistFields(locationCtx);

  const referralCodeInput =
    typeof data.referralCode === "string" ? data.referralCode.trim().toUpperCase() : "";
  const preDiscountTotalZar = Math.round(
    Number(serverBreakdown.estimated_total ?? serverBreakdown.total ?? clientTotal),
  );
  const referralCheckoutFingerprint = buildReferralCheckoutFingerprint({
    clientIp: resolveReferralClientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  // Hard-fail referral validation errors (Phase 1). Invalid codes stay soft (valid:false).
  let referralValidation: Awaited<ReturnType<typeof validateReferralForCheckout>> = {
    valid: false,
    reason: "code_not_found",
  };
  if (referralCodeInput) {
    try {
      referralValidation = await validateReferralForCheckout({
        admin: supabase,
        code: referralCodeInput,
        userId,
        customerEmail: customerEmailNormalized,
        bookingTotalZar: preDiscountTotalZar,
        serviceSlug: data.serviceSlug,
        checkoutFingerprint: referralCheckoutFingerprint,
      });
    } catch (err) {
      console.error("[booking-v2/confirm] referral validation failed:", err);
      return NextResponse.json(
        { error: "Could not validate referral code. Please try again." },
        { status: 503 },
      );
    }
  }
  const referralDiscountZar = referralValidation.valid ? referralValidation.discountZar : 0;
  const referralCheckoutSnapshot = referralValidation.valid
    ? buildReferralCheckoutSnapshot(referralValidation, Date.now(), referralCheckoutFingerprint)
    : null;

  const promoCodeInput = typeof data.promoCode === "string" ? data.promoCode.trim() : "";
  const selectedExtraIds = data.selectedExtras ?? [];
  let promotionApplied: AppliedPromotionDiscount[] = [];
  let promotionDiscountZar = 0;
  try {
    const [completedBookingCount, membershipDiscountPercent] = await Promise.all([
      getCompletedBookingCount(supabase, userId, customerEmailNormalized),
      getActiveMembershipDiscountPercent(supabase, userId),
    ]);
    const promoExtras = await resolveCheckoutPromoEligibilityExtras(supabase, {
      userId,
      locationId: locationCtx.locationId,
      completedBookingCount,
    });
    const promoEval = await evaluateCheckoutPromotions(supabase, {
      userId,
      customerEmail: customerEmailNormalized,
      completedBookingCount,
      serviceSlug: data.serviceSlug,
      selectedExtraIds,
      cityId: locationCtx.cityId,
      locationId: locationCtx.locationId,
      suburb: data.suburb,
      suburbId: promoExtras.suburbId,
      customerSegments: promoExtras.customerSegments,
      subtotalZar: preDiscountTotalZar,
      promoCode: promoCodeInput || null,
      membershipDiscountPercent,
    });
    promotionApplied = promoEval.applied;
    promotionDiscountZar = promoEval.totalDiscountZar;
  } catch (err) {
    // Phase 1: never silently zero discounts — fail confirm so the customer can retry.
    console.error("[booking-v2/confirm] promotion evaluation failed:", err);
    return NextResponse.json(
      { error: "Could not apply promotions. Please try again." },
      { status: 503 },
    );
  }

  // Payable amount must match what Paystack charges — otherwise webhook finalize
  // flags payment_mismatch (paid < stored total_price / price_snapshot).
  const grossZar = preDiscountTotalZar;
  const promotionAppliedZar = Math.min(Math.max(0, promotionDiscountZar), grossZar);
  let payAmountZar = Math.max(0, grossZar - promotionAppliedZar);
  const referralAppliedZar = Math.min(Math.max(0, referralDiscountZar), payAmountZar);
  payAmountZar = Math.max(0, payAmountZar - referralAppliedZar);
  const requestedCredit = Math.round(Number(data.applyCleaningCreditZar ?? 0));
  const creditToApplyCap = Math.min(Math.max(0, requestedCredit), payAmountZar);
  // Credit is spent after the booking row exists; snapshot assumes the capped amount.
  payAmountZar = Math.max(0, payAmountZar - creditToApplyCap);

  // Only Paystack-bound bookings require email. Keep non-payment flows available
  // to phone-only/legacy accounts (for example fully covered and area-review bookings).
  if (payAmountZar > 0 && !customerEmailIsValid) {
    return NextResponse.json(
      {
        error:
          "Your account has no valid email address. Update your email in Account settings, then confirm this booking again.",
        code: "CUSTOMER_EMAIL_REQUIRED",
      },
      { status: 400 },
    );
  }

  // Payable lives in total_price / price_snapshot; collected cash stays zero until settlement.
  const persistPricing = {
    ...persistPricingBase,
    total_price: payAmountZar,
    ...bookingUncollectedCashColumns(),
  };

  // ── 7. Generate Paystack reference ────────────────────────────────────────────
  const paystackReference = `bv2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // ── 8. Build price_snapshot (required by bookings_price_snapshot_required_check) ──
  // total_price = Paystack charge (after promo / referral / credit). Keep gross for audit.
  const priceSnapshot = {
    v: 1 as const,
    service_type: data.serviceSlug,
    base_price: Math.round(serverBreakdown.base_service_price),
    extras: serverBreakdown.selected_extras.map((extra) => ({
      id: extra.extra_id,
      name: extra.name,
      price: extra.price,
    })),
    total_price: payAmountZar,
    server_computed_total: grossZar,
    gross_total: grossZar,
    promotion_discount_zar: promotionAppliedZar,
    referral_discount_zar: referralAppliedZar,
    cleaning_credit_zar: creditToApplyCap,
    pay_total_zar: payAmountZar,
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
    .eq("service_slug", canonicalServiceSlug)
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
        ...locationFields,
        price_snapshot: priceSnapshot,
        service_slug: canonicalServiceSlug,
        fulfillment_mode: fulfillmentMode,
        fulfillment_reason: fulfillmentReason,
        dispatch_status: fulfillmentMode === "ops_assignment" ? "unassigned" : "searching",
        ...(data.cleanerMode === "individual_cleaners"
          ? {
              cleaner_count: Math.max(data.cleanerCount, preferredCleanerIds.length) || data.cleanerCount,
              ...preferredCleanerAssignmentFields(preferredCleanerIds),
            }
          : {}),
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
            email: customerEmailNormalized,
            phone: customerPhone,
          },
          ...(data.recurringFrequency
            ? {
                recurringFrequency: data.recurringFrequency,
                recurringDays: data.recurringDays?.length ? data.recurringDays : [],
              }
            : {}),
          ...(referralCheckoutSnapshot ? { referralCheckout: referralCheckoutSnapshot } : {}),
          ...(promotionApplied.length
            ? {
                promotionCheckout: {
                  applied: promotionApplied,
                  totalDiscountZar: promotionDiscountZar,
                  promoCode: promoCodeInput || null,
                },
              }
            : {}),
          payTotalZar: payAmountZar,
          fulfillmentMode,
          fulfillmentReason,
          ...preferredExtras.snapshotExtension,
          confirmedAt: new Date().toISOString(),
        },
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

    let creditAppliedZar = 0;
    if (creditToApplyCap > 0) {
      const spendResult = await spendCleaningCredit({
        admin: supabase,
        userId,
        amountZar: creditToApplyCap,
        bookingId: existingBooking.id,
        note: "Applied at booking-v2 checkout",
      });
      if (spendResult.ok) {
        creditAppliedZar = spendResult.spent;
        // If spend differed from cap, adjust payable for the client charge.
        if (creditAppliedZar !== creditToApplyCap) {
          payAmountZar = Math.max(0, payAmountZar + creditToApplyCap - creditAppliedZar);
          await supabase
            .from("bookings")
            .update({
              total_price: payAmountZar,
              ...bookingUncollectedCashColumns(),
              price_snapshot: { ...priceSnapshot, cleaning_credit_zar: creditAppliedZar, total_price: payAmountZar, pay_total_zar: payAmountZar },
            })
            .eq("id", existingBooking.id);
        }
      } else {
        // Credit unavailable — charge full amount without credit.
        payAmountZar = Math.max(0, payAmountZar + creditToApplyCap);
        await supabase
          .from("bookings")
          .update({
            total_price: payAmountZar,
            ...bookingUncollectedCashColumns(),
            price_snapshot: { ...priceSnapshot, cleaning_credit_zar: 0, total_price: payAmountZar, pay_total_zar: payAmountZar },
          })
          .eq("id", existingBooking.id);
      }
    }

    if (promotionApplied.length > 0) {
      try {
        await applyPromotionRedemptions(supabase, {
          applied: promotionApplied,
          userId,
          bookingId: existingBooking.id,
          customerEmail: customerEmailNormalized,
          bookingRevenueZar: Math.round(payAmountZar),
          idempotencyPrefix: "bv2",
        });
      } catch {
        // non-fatal: booking already created
      }
    }

    const r0Existing = await trySettleFullyCoveredOrError(supabase, existingBooking.id, payAmountZar);
    if ("errorResponse" in r0Existing) return r0Existing.errorResponse;
    const requiresPayment = r0Existing.requiresPayment;

    return NextResponse.json({
      success: true,
      bookingId: existingBooking.id,
      paystackReference,
      payAmountZar,
      creditAppliedZar,
      referralAppliedZar,
      promotionAppliedZar,
      promotionsApplied: promotionApplied,
      fulfillmentMode,
      requiresPayment,
      customerMessage: fulfillmentCustomerMessage,
      ...(getPaystackPublicKey() ? { paystackPublicKey: getPaystackPublicKey() } : {}),
    });
  }

  // ── 9. Insert booking row ─────────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      // Core identity
      ...bookingCustomerOwnershipPatch(userId, ownershipColumn),
      customer_email: customerEmailNormalized,
      customer_name: customerName,
      customer_phone: customerPhone,
      paystack_reference: paystackReference,

      // Service
      service: data.serviceSlug,
      service_slug: canonicalServiceSlug,

      // Status
      status: "pending_payment",
      payment_status: "pending",
      dispatch_status: fulfillmentMode === "ops_assignment" ? "unassigned" : "searching",
      fulfillment_mode: fulfillmentMode,
      fulfillment_reason: fulfillmentReason,

      // Location
      location: data.address,
      suburb: data.suburb,
      postal_code: data.postalCode,
      ...locationFields,
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
      cleaner_count:
        data.cleanerMode === "individual_cleaners"
          ? Math.max(data.cleanerCount, preferredCleanerIds.length) || data.cleanerCount
          : null,
      ...preferredCleanerAssignmentFields(
        data.cleanerMode === "individual_cleaners" ? preferredCleanerIds : [],
      ),

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
          email: customerEmailNormalized,
          phone: customerPhone,
        },
        ...(data.recurringFrequency
          ? {
              recurringFrequency: data.recurringFrequency,
              recurringDays: data.recurringDays?.length ? data.recurringDays : [],
            }
          : {}),
        ...(referralCheckoutSnapshot ? { referralCheckout: referralCheckoutSnapshot } : {}),
        ...(promotionApplied.length
          ? {
              promotionCheckout: {
                applied: promotionApplied,
                totalDiscountZar: promotionDiscountZar,
                promoCode: promoCodeInput || null,
              },
            }
          : {}),
        payTotalZar: payAmountZar,
        fulfillmentMode,
        fulfillmentReason,
        ...preferredExtras.snapshotExtension,
        confirmedAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    console.error("[booking-v2/confirm] insert error:", insertErr?.message, insertErr?.code);
    const missingCol =
      /fulfillment_mode|fulfillment_reason|PGRST204|schema cache/i.test(insertErr?.message ?? "") ||
      insertErr?.code === "PGRST204";
    const duplicateSlot =
      insertErr?.code === "23505" ||
      /duplicate key|unique constraint|idx_bookings_unique_active_customer_slot/i.test(insertErr?.message ?? "");
    if (duplicateSlot) {
      return NextResponse.json(
        {
          error:
            "You already have an active booking in this time slot. Open your bookings or choose a different time.",
          code: "SLOT_ALREADY_RESERVED",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: missingCol
          ? "Booking save is temporarily unavailable (database migration pending). Please try again shortly."
          : "Could not save your booking. Please try again.",
        code: missingCol ? "BOOKING_SCHEMA_MISMATCH" : "RESERVATION_FAILED",
      },
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

  let creditAppliedZar = 0;
  if (creditToApplyCap > 0) {
    const spendResult = await spendCleaningCredit({
      admin: supabase,
      userId,
      amountZar: creditToApplyCap,
      bookingId: inserted.id,
      note: "Applied at booking-v2 checkout",
    });
    if (spendResult.ok) {
      creditAppliedZar = spendResult.spent;
      if (creditAppliedZar !== creditToApplyCap) {
        payAmountZar = Math.max(0, payAmountZar + creditToApplyCap - creditAppliedZar);
        await supabase
          .from("bookings")
          .update({
            total_price: payAmountZar,
            ...bookingUncollectedCashColumns(),
            price_snapshot: {
              ...priceSnapshot,
              cleaning_credit_zar: creditAppliedZar,
              total_price: payAmountZar,
              pay_total_zar: payAmountZar,
            },
          })
          .eq("id", inserted.id);
      }
    } else {
      payAmountZar = Math.max(0, payAmountZar + creditToApplyCap);
      await supabase
        .from("bookings")
        .update({
          total_price: payAmountZar,
          ...bookingUncollectedCashColumns(),
          price_snapshot: {
            ...priceSnapshot,
            cleaning_credit_zar: 0,
            total_price: payAmountZar,
            pay_total_zar: payAmountZar,
          },
        })
        .eq("id", inserted.id);
    }
  }

  if (promotionApplied.length > 0) {
    try {
      await applyPromotionRedemptions(supabase, {
        applied: promotionApplied,
        userId,
        bookingId: inserted.id,
        customerEmail: customerEmailNormalized,
        bookingRevenueZar: Math.round(payAmountZar),
        idempotencyPrefix: "bv2",
      });
    } catch {
      // non-fatal
    }
  }

  const r0Inserted = await trySettleFullyCoveredOrError(supabase, inserted.id, payAmountZar);
  if ("errorResponse" in r0Inserted) return r0Inserted.errorResponse;
  const requiresPayment = r0Inserted.requiresPayment;

  return NextResponse.json({
    success: true,
    bookingId: inserted.id,
    paystackReference,
    payAmountZar,
    creditAppliedZar,
    referralAppliedZar,
    promotionAppliedZar,
    promotionsApplied: promotionApplied,
    fulfillmentMode,
    requiresPayment,
    customerMessage: fulfillmentCustomerMessage,
    ...(getPaystackPublicKey() ? { paystackPublicKey: getPaystackPublicKey() } : {}),
  });
}
