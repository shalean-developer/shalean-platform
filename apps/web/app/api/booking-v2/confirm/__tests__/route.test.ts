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
vi.mock("@/lib/referrals/validateReferral", () => ({
  validateReferralForCheckout: vi.fn().mockResolvedValue({ valid: false }),
}));

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
  pricingSummary: { total: 574, estimated_total: 574 },
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

    expect(res.status).toBe(200);
    const row = admin.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.fulfillment_mode).toBe("ops_assignment");
    expect(row.dispatch_status).toBe("unassigned");
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

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success?: boolean; bookingId?: string };
    expect(json.success).toBe(true);
    expect(admin.insert).toHaveBeenCalled();
    const row = admin.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.service_slug).toBe("standard");
    expect(row.location_id).toBe("00000000-0000-4000-8000-000000000010");
    expect(row.city_id).toBe("00000000-0000-4000-8000-000000000020");
    expect(row.latitude).toBe(-33.98);
    expect(row.longitude).toBe(18.46);
    expect(row.dispatch_status).toBe("searching");
  });
});
