import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/booking-v2/confirm/route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { loadBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";
import { resolveCustomerPhoneFromAuthAdmin } from "@/lib/admin/adminBookingCustomerContact";
import { resolveBookingV2LocationContext, loadBookingV2LocationContextById } from "@/lib/booking-v2/bookingV2LocationContext";
import { bookingV2SlotHasEligibleCleaners, assessBookingV2SlotFulfillment } from "@/lib/booking-v2/bookingV2SlotEligibility";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
import { isBookingSoftFulfillmentEnabled } from "@/lib/booking/availabilityFlags";
import { loadDispatchTeamsForBooking } from "@/lib/dispatch/loadDispatchTeamsForBooking";
import { assignTeamAndSyncRoster } from "@/lib/booking/assignTeamAndSyncRoster";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    // Route handlers run inside a Next.js request scope in production. Vitest
    // does not create that scope, so execute deferred work immediately here.
    after: (task: () => void | Promise<void>) => {
      void task();
    },
  };
});
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/supabase/bookingRouteBearerAuth", () => ({ resolveBookingRouteBearerAuth: vi.fn() }));
vi.mock("@/lib/customer/customerBookingsForUser", () => ({
  resolveBookingOwnershipColumn: vi.fn(),
}));
vi.mock("@/lib/booking-v2/loadBookingV2Catalog", () => ({ loadBookingV2Catalog: vi.fn() }));
vi.mock("@/lib/admin/adminBookingCustomerContact", () => ({
  resolveCustomerPhoneFromAuthAdmin: vi.fn(),
  trimCustomerPhone: (p: string) => p.trim(),
}));
vi.mock("@/lib/booking-v2/bookingV2LocationContext", () => ({
  resolveBookingV2LocationContext: vi.fn(),
  loadBookingV2LocationContextById: vi.fn(),
}));
vi.mock("@/lib/booking-v2/bookingV2SlotEligibility", () => ({
  bookingV2SlotHasEligibleCleaners: vi.fn(),
  assessBookingV2SlotFulfillment: vi.fn(),
}));
vi.mock("@/lib/booking/logBookingDemandEvent", () => ({
  logBookingDemandEvent: vi.fn(),
}));
vi.mock("@/lib/booking/availabilityFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking/availabilityFlags")>();
  return {
    ...actual,
    isBookingSoftFulfillmentEnabled: vi.fn(() => true),
  };
});
vi.mock("@/lib/booking/getEligibleCleaners", () => ({ getEligibleCleaners: vi.fn() }));
vi.mock("@/lib/dispatch/loadDispatchTeamsForBooking", () => ({
  loadDispatchTeamsForBooking: vi.fn(),
}));
vi.mock("@/lib/booking/assignTeamAndSyncRoster", () => ({
  assignTeamAndSyncRoster: vi.fn(),
}));
vi.mock("@/lib/referrals/validateReferral", () => ({
  validateReferralForCheckout: vi.fn().mockResolvedValue({ valid: false }),
}));
vi.mock("@/lib/referrals/creditReservations", () => ({
  reserveCleaningCreditForBooking: vi.fn().mockResolvedValue({
    ok: true,
    reservationId: "credit-reservation-1",
    amountZar: 0,
    balanceAfter: 0,
    status: "reserved",
  }),
  settleCleaningCreditForBooking: vi.fn().mockResolvedValue({
    ok: false,
    error: "reservation_not_found",
  }),
}));
vi.mock("@/lib/promotions/server", () => ({
  evaluateCheckoutPromotions: vi.fn().mockResolvedValue({ applied: [], totalDiscountZar: 0 }),
  applyPromotionRedemptions: vi.fn().mockResolvedValue(undefined),
  getCompletedBookingCount: vi.fn().mockResolvedValue(0),
  getActiveMembershipDiscountPercent: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/promotions/resolveCheckoutPromoEligibilityExtras", () => ({
  resolveCheckoutPromoEligibilityExtras: vi.fn().mockResolvedValue({
    suburbId: null,
    customerSegments: [],
  }),
}));
vi.mock("@/lib/booking/ensureBookingV2R0LineItems", () => ({
  ensureBookingV2R0LineItems: vi.fn().mockResolvedValue({ ok: true, created: true }),
}));

vi.mock("@/lib/payments/settleFullyCoveredBooking", () => ({
  settleFullyCoveredBooking: vi.fn().mockResolvedValue({
    ok: true,
    alreadySettled: false,
    paymentTransactionId: "tx-r0",
  }),
}));

// These HTTP tests cover identity, staffing and persistence. Quote authority has its own regression suite.
vi.mock("@/lib/booking/pricingVersionDb", () => ({ fetchPricingRatesSnapshotByVersionId: async () => ({ services: { standard: {}, deep: {}, moving: {} } }) }));
vi.mock("@/lib/pricing/pricingRatesSnapshot", () => ({ pricingSnapshotServiceKeyForBookingV2Slug: () => "standard" }));
vi.mock("@/lib/booking-v2/liveServiceConfigFromPricingSnapshot", () => ({ liveServiceConfigFromPricingSnapshot: () => ({ label: "Regular Cleaning", basePrice: 399, extras: [] }) }));
vi.mock("@/lib/booking-v2/buildSignedCustomerPricingFromForm", () => ({ buildSignedCustomerPricingFromForm: () => ({
 total:574, estimated_total:574, base_service_price:544, service_fee:30, subtotal:544,
 selected_extras:[], estimated_duration_minutes:210, estimated_duration_hours:3.5,
 quote_signature:"test-signature", lineItems:[], extras_total:0, discount_amount:0,
}) }));
vi.mock("@/lib/booking/quote/validateBookingV2Quote", () => ({ assertV2ConfirmQuoteIntegrity: () => ({ ok:true }) }));
const basePayload = {
  serviceSlug: "regular-cleaning" as const,
  serviceDetails: { bedrooms: "2", bathrooms: "1", extraRooms: "0", propertyType: "house" },
  address: "12 Ocean View Drive",
  suburb: "Claremont",
  serviceAreaLocationId: "00000000-0000-4000-8000-000000000010",
  serviceAreaCityId: "00000000-0000-4000-8000-000000000020",
  city: "Cape Town",
  postalCode: "7708",
  accessInstructions: "",
  parkingInstructions: "",
  gateCode: "",
  contactPhone: "0821234567",
  selectedExtras: [],
  equipmentRequired: "no" as const,
  equipmentQuote: null,
  bookingType: "once_off" as const,
  date: "2026-08-15",
  time: "09:00",
  alternativeDate: "",
  alternativeTime: "",
  recurringFrequency: "" as const,
  recurringDays: [],
  recurringStartDate: "",
  recurringEndDate: "",
  cleanerMode: "individual_cleaners" as const,
  assignedTeamId: "",
  cleanerCount: 1,
  selectedCleanerIds: [],
  pricingSummary: { total: 574, estimated_total: 574, quote_signature:"test-signature" },
  quoteLock: {pricingVersionId:"00000000-0000-4000-8000-000000000100",quoteSignature:"test-signature",lockedAt:"2026-11-13T00:00:00.000Z",expiresAt:"2099-01-01T00:00:00.000Z"},
};

function mockAdminForConfirm() {
  const insertSingle = vi.fn().mockResolvedValue({
    data: { id: "00000000-0000-4000-8000-000000000099" },
    error: null,
  });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: insertSingle }) });
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };
  const from = vi.fn((table: string) => {
    if (table === "bookings") {
      return {
        select: vi.fn().mockReturnValue(eqChain),
        insert,
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    if (table === "user_profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { full_name: "Test User" }, error: null }),
          }),
        }),
      };
    }
    if (table === "cleaners") {
      return { select: () => ({ in: (_key: string, ids: string[]) => Promise.resolve({ data: ids.map(id => ({id})),error:null }) }) };
    }
    if (table === "teams") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { lead_cleaner_id: "00000000-0000-4000-8000-000000000031" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "recurring_prepaid_packages") {
      return {
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "00000000-0000-4000-8000-000000000040" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "customer_saved_addresses") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) };
  });
  return { from, insert, insertSingle };
}

describe("POST /api/booking-v2/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBookingRouteBearerAuth).mockResolvedValue({
      kind: "authenticated",
      userId: "00000000-0000-4000-8000-000000000001",
      email: "test@example.com",
    });
    vi.mocked(resolveBookingOwnershipColumn).mockResolvedValue("user_id");
    vi.mocked(resolveCustomerPhoneFromAuthAdmin).mockResolvedValue(null);
    vi.mocked(loadBookingV2Catalog).mockResolvedValue({
      catalog: {
        "regular-cleaning": {
          basePrice: 399,
          pricePerBedroom: 45,
          pricePerBathroom: 55,
          pricePerExtraRoom: 30,
          pricePerExtraCleaner: 299,
          estimatedDurationHours: 3,
          minDurationHours: 3.5,
          maxDurationHours: 8,
          extras: [],
        },
      },
      feesConfig: {
        serviceFeeRule: "flat",
        serviceFeeFlatCents: 3000,
        recurringDiscounts: {},
        propertyFactorRates: {},
      },
    } as never);
    vi.mocked(resolveBookingV2LocationContext).mockResolvedValue({
      locationId: "00000000-0000-4000-8000-000000000010",
      cityId: "00000000-0000-4000-8000-000000000020",
      latitude: -33.98,
      longitude: 18.46,
    });
    vi.mocked(loadBookingV2LocationContextById).mockResolvedValue({
      locationId: "00000000-0000-4000-8000-000000000010",
      cityId: "00000000-0000-4000-8000-000000000020",
      latitude: -33.98,
      longitude: 18.46,
    });
    vi.mocked(bookingV2SlotHasEligibleCleaners).mockResolvedValue(true);
    vi.mocked(assessBookingV2SlotFulfillment).mockResolvedValue({
      mode: "instant",
      reason: "eligible_cleaner_available",
      instantCount: 1,
      opsCount: 1,
      requiresPayment: true,
      customerMessage: "",
    });
    vi.mocked(isBookingSoftFulfillmentEnabled).mockReturnValue(true);
    vi.mocked(getEligibleCleaners).mockResolvedValue([]);
    vi.mocked(assignTeamAndSyncRoster).mockResolvedValue({ ok: true });
    vi.mocked(loadDispatchTeamsForBooking).mockResolvedValue({
      teams: [{
        id: "00000000-0000-4000-8000-000000000030",
        name: "Shalean Team 3",
        service_type: "deep",
        available: true,
        active_member_count: 3,
        qualified_member_count: 3,
      }],
      platformAtCapacity: false,
      error: null,
    });
  });

  it.each([null, "", "not-an-email", "missing-domain@"])(
    "rejects a payment-required booking without a valid email: %s",
    async (email) => {
      vi.mocked(resolveBookingRouteBearerAuth).mockResolvedValue({
        kind: "authenticated",
        userId: "00000000-0000-4000-8000-000000000001",
        email,
      });

      const admin = mockAdminForConfirm();
      vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

      const res = await POST(
        new Request("http://localhost/api/booking-v2/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
          body: JSON.stringify(basePayload),
        }),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ code: "CUSTOMER_EMAIL_REQUIRED" });
      expect(admin.insert).not.toHaveBeenCalled();
    },
  );

  it("normalizes the authenticated email before persisting the booking", async () => {
    vi.mocked(resolveBookingRouteBearerAuth).mockResolvedValue({
      kind: "authenticated",
      userId: "00000000-0000-4000-8000-000000000001",
      email: "  Test.User@Example.COM  ",
    });
    const admin = mockAdminForConfirm();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      new Request("http://localhost/api/booking-v2/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify(basePayload),
      }),
    );

    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const row = admin.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.customer_email).toBe("test.user@example.com");
  });

  it("returns 422 when suburb cannot be resolved to a service area", async () => {
    vi.mocked(resolveBookingV2LocationContext).mockResolvedValue(null);
    vi.mocked(loadBookingV2LocationContextById).mockResolvedValue(null);
    const admin = mockAdminForConfirm();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      new Request("http://localhost/api/booking-v2/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify(basePayload),
      }),
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/service area/i);
  });

  it("returns AREA_REVIEW_REQUIRED when soft fulfillment finds no coverage", async () => {
    vi.mocked(resolveBookingRouteBearerAuth).mockResolvedValue({
      kind: "authenticated",
      userId: "00000000-0000-4000-8000-000000000001",
      email: null,
    });
    vi.mocked(assessBookingV2SlotFulfillment).mockResolvedValue({
      mode: "area_review",
      reason: "no_active_cleaner_coverage",
      instantCount: 0,
      opsCount: 0,
      requiresPayment: false,
      customerMessage: "We're expanding into your area.",
    });
    const admin = mockAdminForConfirm();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      new Request("http://localhost/api/booking-v2/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify(basePayload),
      }),
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as { code?: string; fulfillmentMode?: string };
    expect(json.code).toBe("AREA_REVIEW_REQUIRED");
    expect(json.fulfillmentMode).toBe("area_review");
  });

  it("allows ops_assignment confirm when no instant cleaner but coverage exists", async () => {
    vi.mocked(assessBookingV2SlotFulfillment).mockResolvedValue({
      mode: "ops_assignment",
      reason: "ops_assignable_coverage",
      instantCount: 0,
      opsCount: 2,
      requiresPayment: true,
      customerMessage: "We'll assign shortly.",
    });
    const admin = mockAdminForConfirm();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      new Request("http://localhost/api/booking-v2/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify(basePayload),
      }),
    );

    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const row = admin.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.fulfillment_mode).toBe("ops_assignment");
    expect(row.dispatch_status).toBe("unassigned");
  });

  it("persists the selected team and its payout owner for a team booking", async () => {
    vi.mocked(loadBookingV2Catalog).mockResolvedValue({
      catalog: {
        "deep-cleaning": {
          slug: "deep-cleaning",
          label: "Deep Cleaning",
          shortLabel: "Deep Clean",
          description: "Deep cleaning",
          cleanerMode: "team",
          showEquipmentQuestion: false,
          allowsExtraCleaner: false,
          step1Questions: [],
          basePrice: 950,
          pricePerBedroom: 100,
          pricePerBathroom: 80,
          pricePerExtraRoom: 30,
          pricePerExtraCleaner: 0,
          serviceFeeZar: 60,
          estimatedDurationHours: 7.3,
          minDurationHours: 3.5,
          maxDurationHours: 8,
          extras: [],
        },
      },
      feesConfig: {
        serviceFeeRule: "flat",
        serviceFeeFlatCents: 3000,
        recurringDiscounts: {},
        propertyFactorRates: {},
      },
    } as never);

    const admin = mockAdminForConfirm();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const teamId = "00000000-0000-4000-8000-000000000030";
    const payoutOwnerId = "00000000-0000-4000-8000-000000000031";

    const res = await POST(
      new Request("http://localhost/api/booking-v2/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify({
          ...basePayload,
          serviceSlug: "deep-cleaning",
          serviceDetails: {
            bedrooms: "1",
            bathrooms: "3",
            extraRooms: "2",
            propertyType: "townhouse",
            lastCleaned: "6_months_plus",
            hasPets: "cats",
          },
          bookingType: "recurring",
          recurringFrequency: "monthly",
          recurringStartDate: basePayload.date,
          cleanerMode: "team",
          assignedTeamId: teamId,
          pricingSummary: { total: 2140, estimated_total: 2140, quote_signature:"test-signature" },
        }),
      }),
    );

    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const row = admin.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    // The initial row is deliberately non-team-shaped. The approved RPC then
    // assigns the team and materializes booking_cleaners in one DB transaction.
    expect(row.is_team_job).toBe(false);
    expect(row.team_id).toBeNull();
    expect(row.assigned_team_id).toBe(teamId);
    expect(row.payout_owner_cleaner_id).toBeNull();
    expect(assignTeamAndSyncRoster).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: "00000000-0000-4000-8000-000000000099",
        teamId,
        payoutOwnerCleanerId: payoutOwnerId,
        teamMemberCountSnapshot: 3,
        variant: "admin",
        source: "booking_v2_confirm",
      }),
    );
  });

  it("inserts booking with location_id and canonical service_slug when eligible", async () => {
    const admin = mockAdminForConfirm();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      new Request("http://localhost/api/booking-v2/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify(basePayload),
      }),
    );

    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const json = (await res.json()) as { success?: boolean; bookingId?: string; payAmountZar?: number };
    expect(json.success).toBe(true);
    expect(admin.insert).toHaveBeenCalled();
    const row = admin.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.service_slug).toBe("standard");
    expect(row.location_id).toBe("00000000-0000-4000-8000-000000000010");
    expect(row.city_id).toBe("00000000-0000-4000-8000-000000000020");
    expect(row.latitude).toBe(-33.98);
    expect(row.longitude).toBe(18.46);
    expect(row.dispatch_status).toBe("searching");
    // BK-001: unpaid confirm must not write collected-cash columns.
    expect(row.amount_paid_cents).toBe(0);
    expect(row.total_paid_cents).toBe(0);
    expect(row.total_paid_zar).toBe(0);
    expect(row.payment_status).toBe("pending");
    expect(row.status).toBe("pending_payment");
    expect(Number(row.total_price)).toBeGreaterThan(0);
    expect(json.payAmountZar).toBe(row.total_price);
  });
  it.each([1, 2, 3])("preserves named preferences and %i places on operations bookings", async count => {
    const admin=mockAdminForConfirm();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    vi.mocked(assessBookingV2SlotFulfillment).mockResolvedValue({mode:"ops_assignment",reason:"known_area_pending_ops_assignment",instantCount:0,opsCount:1,requiresPayment:true,customerMessage:"Operations will confirm"});
    const ids=["00000000-0000-4000-8000-000000000021","00000000-0000-4000-8000-000000000022","00000000-0000-4000-8000-000000000023"].slice(0,count);
    const response=await POST(new Request("http://localhost/api/booking-v2/confirm",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer test"},body:JSON.stringify({...basePayload,cleanerCount:count,selectedCleanerIds:ids})}));
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    const row=admin.insert.mock.calls[0]?.[0] as Record<string,unknown>;
    expect(row.cleaner_count).toBe(count);
    expect(row.booking_snapshot).toMatchObject({cleanerCount:count,selectedCleanerIds:ids});
    expect(row.cleaner_id).not.toBeTruthy();
  });

});
