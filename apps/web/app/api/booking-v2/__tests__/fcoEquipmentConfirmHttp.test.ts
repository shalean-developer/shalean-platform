import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  payload: {} as Record<string, unknown>,
  profileReads: vi.fn(),
  ownershipReads: vi.fn(),
  phoneReads: vi.fn(),
  quoteBuilder: vi.fn(),
  paymentWrites: vi.fn(),
}));
vi.mock("@/lib/supabase/bookingRouteBearerAuth", () => ({
  resolveBookingRouteBearerAuth: async () => ({
    kind: "authenticated", userId: "synthetic-user-id", email: "synthetic@example.invalid",
  }),
}));
vi.mock("@/src/features/booking-v2/schemas", () => ({
  bookingV2ConfirmSchema: { safeParse: () => ({ success: true, data: mocks.payload }) },
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "user_profiles") throw new Error("UNEXPECTED_DB_ACCESS:" + table);
      return {
        select: () => ({
          eq: () => ({ maybeSingle: mocks.profileReads }),
        }),
      };
    },
  }),
}));
vi.mock("@/lib/booking/pricingVersionDb", () => ({
  fetchPricingRatesSnapshotByVersionId: async () => ({
    services: { "regular-cleaning": { base_price: 250 } },
  }),
}));
vi.mock("@/lib/pricing/pricingRatesSnapshot", () => ({
  pricingSnapshotServiceKeyForBookingV2Slug: () => "regular-cleaning",
}));
vi.mock("@/lib/booking-v2/liveServiceConfigFromPricingSnapshot", () => ({
  liveServiceConfigFromPricingSnapshot: () => ({ label: "Regular Cleaning" }),
}));
vi.mock("@/lib/customer/customerBookingsForUser", () => ({
  resolveBookingOwnershipColumn: mocks.ownershipReads,
}));
vi.mock("@/lib/admin/adminBookingCustomerContact", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/admin/adminBookingCustomerContact")>();
  return { ...original, resolveCustomerPhoneFromAuthAdmin: mocks.phoneReads };
});
vi.mock("@/lib/booking-v2/buildSignedCustomerPricingFromForm", () => ({
  buildSignedCustomerPricingFromForm: mocks.quoteBuilder,
}));
vi.mock("@/lib/booking-v2/loadEquipmentPricingConfig", () => ({
  loadEquipmentPricingConfig: async () => ({
    is_active: true, base_fee_zar: 450, price_per_km_zar: 25,
    max_auto_distance_km: 20, base_address: "Equipment base",
    base_latitude: -33.9768, base_longitude: 18.4686,
    manual_quote_message: "Manual quote",
  }),
}));

import { POST as postConfirm } from "@/app/api/booking-v2/confirm/route";
import { issueEquipmentQuoteReceipt } from "@/lib/booking-v2/equipmentQuoteAuthority";
import { hashFcoEquipmentSession, issueFcoEquipmentSession } from "@/lib/booking-v2/fcoEquipmentSession";
import { fcoEquipmentPricingRevision } from "@/lib/booking-v2/fcoEquipmentServerGuard";

const address = {
  address: "21 Main Road, Unit 4", suburb: "Claremont", city: "Cape Town", postalCode: "7708",
};
function defaultPayload() {
  return {
    serviceSlug: "regular-cleaning", serviceDetails: {},
    ...address, contactPhone: "0821234567",
    cleanerMode: "individual_cleaners", assignedTeamId: "",
    equipmentRequired: "yes", equipmentQuote: null,
    bookingType: "once_off", recurringFrequency: "",
    selectedExtras: [], cleanerCount: 1, date: "2026-11-30", time: "09:00",
    pricingSummary: { total: 800, quote_signature: "synthetic-signature" },
    quoteLock: {
      pricingVersionId: "synthetic-pricing-version", quoteSignature: "synthetic-signature",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  };
}
async function confirm(patch: Record<string, unknown>, cookie = "") {
  mocks.payload = { ...defaultPayload(), ...patch };
  const response = await postConfirm(new Request("http://localhost/api/booking-v2/confirm", {
    method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(mocks.payload),
  }));
  return { status: response.status, body: await response.json() as { code?: string } };
}

beforeEach(() => {
  vi.stubEnv("SHALEAN_APP_ENV", "staging");
  vi.stubEnv("NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW", "true");
  vi.stubEnv("FCO_01_EQUIPMENT_RECEIPT_SECRET", "fco-http-confirm-secret-2026-long-enough");
  mocks.profileReads.mockResolvedValue({ data: { full_name: "Synthetic", tier: "standard" }, error: null });
  mocks.ownershipReads.mockResolvedValue("user_id");
  mocks.phoneReads.mockResolvedValue("0821234567");
  mocks.quoteBuilder.mockClear();
  mocks.paymentWrites.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("FCO-01 isolated confirmation HTTP failure boundary", () => {
  it("rejects missing equipment receipt before financial quote or booking persistence", async () => {
    const result = await confirm({ equipmentQuote: null });
    expect(result.status).toBe(409);
    expect(result.body.code).toContain("EQUIPMENT_RECEIPT_");
    expect(mocks.quoteBuilder).not.toHaveBeenCalled();
  });

  it("rejects forged equipment receipt and cannot create a booking", async () => {
    const result = await confirm({
      equipmentQuote: {
        distance_km: 5, base_fee: 450, price_per_km: 25, distance_charge: 125,
        logistics_fee: 575, base_location: "Equipment base",
        manual_quote_required: false, manual_quote_message: "",
        authorityReceipt: "forged.unsigned",
      },
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toContain("EQUIPMENT_RECEIPT_");
    expect(mocks.quoteBuilder).not.toHaveBeenCalled();
  });

  it("rejects a valid equipment receipt stolen from another browser session", async () => {
    const secret = "fco-http-confirm-secret-2026-long-enough";
    const correctSession = issueFcoEquipmentSession(new Request("http://localhost/"));
    const revision = fcoEquipmentPricingRevision({
      is_active: true, base_fee_zar: 450, price_per_km_zar: 25,
      max_auto_distance_km: 20, base_address: "Equipment base",
      base_latitude: -33.9768, base_longitude: 18.4686,
      manual_quote_message: "Manual quote",
    });
    const now = Date.now();
    const authorityReceipt = issueEquipmentQuoteReceipt({
      address, sessionHash: hashFcoEquipmentSession(correctSession),
      distanceKm: 6, baseFeeZar: 450, distanceChargeZar: 150,
      logisticsFeeZar: 600, pricePerKmZar: 25, baseLocation: "Equipment base",
      pricingConfigRevision: revision, manualQuoteRequired: false,
      issuedAtMs: now, expiresAtMs: now + 600_000, secret,
    });
    const equipmentQuote = {
      distance_km: 6, base_fee: 450, price_per_km: 25, distance_charge: 150,
      logistics_fee: 600, base_location: "Equipment base",
      manual_quote_required: false, manual_quote_message: "", authorityReceipt,
    };
    const result = await confirm({ equipmentQuote }, "fco01_equipment_session=" + "e".repeat(64));
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("EQUIPMENT_RECEIPT_SESSION_MISMATCH");
    expect(mocks.quoteBuilder).not.toHaveBeenCalled();
  });

  it("FCO-SR-01: confirms only authorized equipment data reaches location resolution", () => {
    const source = readFileSync(join(process.cwd(), "app/api/booking-v2/confirm/route.ts"), "utf8");
    expect(source).toContain("const serverEquipmentQuote = equipmentAuthority.quote");
    expect(source).toContain("equipmentQuote: serverEquipmentQuote,");
    expect(source).not.toContain("serverEquipmentQuote ?? (data.equipmentQuote");
    // No bypass of the legacy No-equipment branch is permitted in either route.
    const guard = readFileSync(join(process.cwd(), "lib/booking-v2/fcoEquipmentServerGuard.ts"), "utf8");
    expect(guard).toContain('input.equipmentRequired === "yes" ? input.suppliedQuote : null');
  });

  it("retains existing quote-lock prerequisite", async () => {
    const result = await confirm({ quoteLock: null });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("QUOTE_LOCK_REQUIRED");
    expect(mocks.quoteBuilder).not.toHaveBeenCalled();
  });
});
