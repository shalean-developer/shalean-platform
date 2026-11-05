import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: {
    is_active: true, base_fee_zar: 450, price_per_km_zar: 25,
    max_auto_distance_km: 20, base_address: "Equipment base",
    base_latitude: -33.9768, base_longitude: 18.4686,
    manual_quote_message: "Contact Shalean for a manual quote.",
  },
  equipmentQuote: vi.fn(),
  signedCustomerQuote: vi.fn(),
  pricingSnapshot: vi.fn(),
  pricingVersion: vi.fn(),
}));
vi.mock("@/lib/booking-v2/loadEquipmentPricingConfig", () => ({
  loadEquipmentPricingConfig: async () => mocks.config,
}));
vi.mock("@/lib/booking-v2/equipmentPricing", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/booking-v2/equipmentPricing")>();
  return { ...original, quoteEquipmentForAddress: mocks.equipmentQuote };
});
vi.mock("@/lib/booking-v2/buildSignedCustomerPricingFromForm", () => ({
  buildSignedCustomerPricingFromForm: mocks.signedCustomerQuote,
}));
vi.mock("@/lib/booking-v2/loadBookingV2Catalog", () => ({
  loadCachedBookingV2Catalog: async () => ({
    catalog: { "regular-cleaning": { label: "Regular Cleaning" } },
    feesConfig: {},
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/pricing/buildPricingRatesSnapshotFromDb", () => ({
  buildPricingRatesSnapshotFromDb: mocks.pricingSnapshot,
}));
vi.mock("@/lib/booking/pricingVersionDb", () => ({
  getOrCreatePricingVersionId: mocks.pricingVersion,
}));

import { POST as postEquipment } from "@/app/api/booking-v2/equipment-quote/route";
import { POST as postQuote } from "@/app/api/booking-v2/quote/route";

const secret = "fco-http-test-receipt-secret-long-enough";
const address = {
  address: "21 Main Road, Unit 4", suburb: "Claremont", city: "Cape Town", postalCode: "7708",
};
const expectedQuote = {
  distance_km: 6, base_fee: 450, price_per_km: 25, distance_charge: 150,
  logistics_fee: 600, base_location: "Equipment base",
  manual_quote_required: false, manual_quote_message: "",
};

let sessionCookie = "";
function request(path: string, body: Record<string, unknown>, cookie = "") {
  return new Request("http://localhost/api/booking-v2/" + path, {
    method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}
async function issue(overrides: Record<string, unknown> = {}) {
  const res = await postEquipment(request("equipment-quote", {
    ...address, serviceSlug: "regular-cleaning", equipmentRequired: true, ...overrides,
  }));
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) sessionCookie = setCookie.split(";")[0];
  return { status: res.status, body: await res.json() as { quote?: typeof expectedQuote & {authorityReceipt?: string}; code?: string } };
}
async function quote(equipmentQuote: Record<string, unknown> | null, overrides: Record<string, unknown> = {}) {
  const cookie = typeof overrides.__cookie === "string" ? overrides.__cookie : sessionCookie;
  const { __cookie: _ignoredCookie, ...actualOverrides } = overrides;
  const response = await postQuote(request("quote", {
    serviceSlug: "regular-cleaning",
    serviceDetails: { propertyType: "house", bedrooms: "2", bathrooms: "1", extraRooms: "0", hasPets: "no" },
    selectedExtras: [], cleanerMode: "individual_cleaners", cleanerCount: 1,
    bookingType: "once_off", equipmentRequired: "yes",
    equipmentQuote, ...address, ...actualOverrides,
  }, cookie));
  return { status: response.status, body: await response.json() as { code?: string; quoteLock?: object } };
}

beforeEach(() => {
  sessionCookie = "";
  vi.stubEnv("SHALEAN_APP_ENV", "staging");
  vi.stubEnv("NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW", "true");
  vi.stubEnv("FCO_01_EQUIPMENT_RECEIPT_SECRET", secret);
  mocks.equipmentQuote.mockReset().mockResolvedValue({ ...expectedQuote });
  mocks.signedCustomerQuote.mockReset().mockReturnValue({ quote_signature: "test-signed-quote", total: 800 });
  mocks.pricingSnapshot.mockReset().mockResolvedValue({ services: {} });
  mocks.pricingVersion.mockReset().mockResolvedValue({ id: "test-version" });
});
afterEach(() => vi.unstubAllEnvs());

describe("FCO-01 HTTP quote boundaries without real provider/database writes", () => {
  it("issues a receipt from server-calculated logistics and signs only verified fees", async () => {
    const issued = await issue();
    expect(issued.status).toBe(200);
    expect(issued.body.quote?.authorityReceipt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const result = await quote(issued.body.quote!);
    expect(result.status).toBe(200);
    expect(result.body.quoteLock).toBeTruthy();
    const values = mocks.signedCustomerQuote.mock.calls.at(-1)?.[0]?.values;
    expect(values?.equipmentQuote.logistics_fee).toBe(600);
    expect(values?.equipmentQuote.base_fee).toBe(450);
  });

  it("rejects absent, forged, altered-price, changed-address and changed-suburb receipts before quote lock", async () => {
    const issued = await issue();
    const q = issued.body.quote!;
    for (const [candidate, updates] of [
      [null, {}],
      [{ ...q, authorityReceipt: "not-signed" }, {}],
      [{ ...q, logistics_fee: 0 }, {}],
      [q, { address: "22 Main Road, Unit 4" }],
      [q, { suburb: "Rondebosch" }],
    ] as const) {
      mocks.signedCustomerQuote.mockClear();
      const rejected = await quote(candidate, updates);
      expect(rejected.status).toBe(409);
      expect(rejected.body.quoteLock).toBeUndefined();
      expect(mocks.signedCustomerQuote).not.toHaveBeenCalled();
    }
  });

  it("rejects a copied receipt in a second session at the same address", async () => {
    const issued = await issue();
    const accepted = await quote(issued.body.quote!);
    expect(accepted.status).toBe(200);
    const rejected = await quote(issued.body.quote!, { __cookie: "fco01_equipment_session=" + "f".repeat(64) });
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe("EQUIPMENT_RECEIPT_SESSION_MISMATCH");
    const missing = await quote(issued.body.quote!, { __cookie: "" });
    expect(missing.status).toBe(409);
  });

  it("refuses manual equipment quotes before receipt issuance", async () => {
    mocks.equipmentQuote.mockResolvedValueOnce({
      ...expectedQuote, manual_quote_required: true, logistics_fee: 0,
    });
    const res = await issue();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EQUIPMENT_MANUAL_QUOTE_REQUIRED");
  });

  it("preserves legacy production quote path when the flag is disabled", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    const result = await quote({ ...expectedQuote });
    expect(result.status).toBe(200);
  });
});
