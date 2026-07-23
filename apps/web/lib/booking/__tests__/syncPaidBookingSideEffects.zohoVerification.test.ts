import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createZohoInvoiceMock,
  getZohoInvoiceMock,
  markZohoInvoicePaidMock,
  lookupZohoCustomerContactIdMock,
  resolveZohoCustomerContactForBookingMock,
  upsertInvoiceSyncMetadataMock,
  provisionV2RecurringPlanMock,
  resolveBookingOwnershipColumnMock,
  logSystemEventMock,
} = vi.hoisted(() => ({
  createZohoInvoiceMock: vi.fn(),
  getZohoInvoiceMock: vi.fn(),
  markZohoInvoicePaidMock: vi.fn(),
  lookupZohoCustomerContactIdMock: vi.fn(),
  resolveZohoCustomerContactForBookingMock: vi.fn(),
  upsertInvoiceSyncMetadataMock: vi.fn(),
  provisionV2RecurringPlanMock: vi.fn(),
  resolveBookingOwnershipColumnMock: vi.fn(),
  logSystemEventMock: vi.fn(),
}));

vi.mock("@/lib/zoho/zohoBooksService", () => ({
  createZohoInvoice: createZohoInvoiceMock,
  getZohoInvoice: getZohoInvoiceMock,
  markZohoInvoicePaid: markZohoInvoicePaidMock,
  lookupZohoCustomerContactId: lookupZohoCustomerContactIdMock,
  todayYmdJhb: () => "2026-07-23",
}));

vi.mock("@/lib/zoho/resolveZohoCustomerContact", () => ({
  resolveZohoCustomerContactForBooking: resolveZohoCustomerContactForBookingMock,
}));

vi.mock("@/lib/accounting/syncInvoiceMetadata", () => ({
  upsertInvoiceSyncMetadata: upsertInvoiceSyncMetadataMock,
}));

vi.mock("@/lib/recurring/provisionV2RecurringPlan", () => ({
  provisionV2RecurringPlan: provisionV2RecurringPlanMock,
}));

vi.mock("@/lib/customer/customerBookingsForUser", () => ({
  resolveBookingOwnershipColumn: resolveBookingOwnershipColumnMock,
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: logSystemEventMock,
}));

vi.mock("@/lib/referrals/zohoLineItems", () => ({
  buildZohoLineItemsWithReferralPromos: () => [{ name: "Clean", rate: 450, quantity: 1 }],
}));

import {
  isAuthoritativeZohoInvoicePaid,
  syncPaidBookingSideEffects,
  validateAuthoritativeZohoInvoiceSettlement,
} from "@/lib/booking/syncPaidBookingSideEffects";

function makeAdmin(row: Record<string, unknown>) {
  const updateEq = vi.fn(async () => ({ error: null }));
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: row, error: null })),
            })),
          })),
          update: vi.fn(() => ({ eq: updateEq })),
        };
      }
      return {};
    }),
    _updateEq: updateEq,
  } as never;
}

function paidMatchingInvoice(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    zohoInvoiceId: "z1",
    invoiceNumber: "INV-1",
    status: "paid",
    totalCents: 45000,
    balanceCents: 0,
    taxCents: 0,
    customerId: "zc1",
    currencyCode: "ZAR",
    ...overrides,
  };
}

describe("syncPaidBookingSideEffects Zoho verification", () => {
  beforeEach(() => {
    createZohoInvoiceMock.mockReset();
    getZohoInvoiceMock.mockReset();
    markZohoInvoicePaidMock.mockReset();
    lookupZohoCustomerContactIdMock.mockReset();
    resolveZohoCustomerContactForBookingMock.mockReset();
    upsertInvoiceSyncMetadataMock.mockReset();
    provisionV2RecurringPlanMock.mockReset();
    resolveBookingOwnershipColumnMock.mockReset();
    logSystemEventMock.mockReset();
    resolveBookingOwnershipColumnMock.mockResolvedValue("customer_id");
    process.env.ZOHO_CLIENT_ID = "id";
    process.env.ZOHO_REFRESH_TOKEN = "rt";
  });

  it("isAuthoritativeZohoInvoicePaid requires paid status and exact zero balance", () => {
    expect(isAuthoritativeZohoInvoicePaid({ status: "paid", balanceCents: 0 })).toBe(true);
    expect(isAuthoritativeZohoInvoicePaid({ status: "paid", balanceCents: 1 })).toBe(false);
    expect(isAuthoritativeZohoInvoicePaid({ status: "sent", balanceCents: 0 })).toBe(false);
  });

  it("validateAuthoritativeZohoInvoiceSettlement accepts exact match", () => {
    expect(
      validateAuthoritativeZohoInvoiceSettlement(paidMatchingInvoice(), {
        expectedAmountCents: 45000,
        expectedCurrencyCode: "ZAR",
        expectedZohoCustomerId: "zc1",
        requireCustomerMatch: true,
      }),
    ).toEqual({ ok: true });
  });

  it("validateAuthoritativeZohoInvoiceSettlement blocks amount mismatch", () => {
    const result = validateAuthoritativeZohoInvoiceSettlement(paidMatchingInvoice({ totalCents: 99900 }), {
      expectedAmountCents: 45000,
      requireCustomerMatch: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("zoho_invoice_amount_mismatch");
  });

  it("validateAuthoritativeZohoInvoiceSettlement blocks currency mismatch and missing currency", () => {
    const mismatch = validateAuthoritativeZohoInvoiceSettlement(
      paidMatchingInvoice({ currencyCode: "USD" }),
      { expectedAmountCents: 45000 },
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error).toContain("zoho_invoice_currency_mismatch");

    const missing = validateAuthoritativeZohoInvoiceSettlement(
      paidMatchingInvoice({ currencyCode: "" }),
      { expectedAmountCents: 45000 },
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe("zoho_invoice_currency_missing");
  });

  it("validateAuthoritativeZohoInvoiceSettlement blocks customer mismatch / missing when required", () => {
    const mismatch = validateAuthoritativeZohoInvoiceSettlement(paidMatchingInvoice({ customerId: "other" }), {
      expectedAmountCents: 45000,
      expectedZohoCustomerId: "zc1",
      requireCustomerMatch: true,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error).toContain("zoho_invoice_customer_mismatch");

    const missingExpected = validateAuthoritativeZohoInvoiceSettlement(paidMatchingInvoice(), {
      expectedAmountCents: 45000,
      expectedZohoCustomerId: null,
      requireCustomerMatch: true,
    });
    expect(missingExpected.ok).toBe(false);
    if (!missingExpected.ok) expect(missingExpected.error).toBe("zoho_invoice_expected_customer_missing");

    const missingActual = validateAuthoritativeZohoInvoiceSettlement(
      paidMatchingInvoice({ customerId: null }),
      {
        expectedAmountCents: 45000,
        expectedZohoCustomerId: "zc1",
        requireCustomerMatch: true,
      },
    );
    expect(missingActual.ok).toBe(false);
    if (!missingActual.ok) expect(missingActual.error).toBe("zoho_invoice_customer_missing");
  });

  it("returns failed on allocation failure (does not invent zero balance)", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      total_paid_zar: 450,
      payment_method: "cash",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C", phone: null },
    });
    createZohoInvoiceMock.mockResolvedValue({
      ok: true,
      zohoInvoiceId: "z1",
      invoiceNumber: "INV-1",
    });
    markZohoInvoicePaidMock.mockResolvedValue({ ok: false, error: "allocate_down" });

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "cash_b1",
      amountCents: 45000,
    });

    expect(result).toEqual({
      kind: "failed",
      error: "zoho_payment_allocation_failed:allocate_down",
    });
    expect(getZohoInvoiceMock).not.toHaveBeenCalled();
  });

  it("returns failed when allocation succeeds but Zoho read fails", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      total_paid_zar: 450,
      payment_method: "cash",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C", phone: null },
    });
    createZohoInvoiceMock.mockResolvedValue({
      ok: true,
      zohoInvoiceId: "z1",
      invoiceNumber: "INV-1",
    });
    markZohoInvoicePaidMock.mockResolvedValue({ ok: true, paymentId: "p1" });
    getZohoInvoiceMock.mockResolvedValue({ ok: false, error: "read_down" });

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "cash_b1",
      amountCents: 45000,
    });

    expect(result).toEqual({
      kind: "failed",
      error: "zoho_invoice_read_failed:read_down",
    });
  });

  it("returns failed for paid/non-zero Zoho balance after allocation", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      total_paid_zar: 450,
      payment_method: "eft",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C", phone: null },
    });
    createZohoInvoiceMock.mockResolvedValue({
      ok: true,
      zohoInvoiceId: "z1",
      invoiceNumber: "INV-1",
    });
    markZohoInvoicePaidMock.mockResolvedValue({ ok: true, paymentId: "p1" });
    getZohoInvoiceMock.mockResolvedValue(
      paidMatchingInvoice({ status: "paid", balanceCents: 1200, totalCents: 45000 }),
    );

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "eft_ref",
      amountCents: 45000,
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error).toContain("zoho_invoice_not_paid_zero_balance");
    expect(upsertInvoiceSyncMetadataMock).not.toHaveBeenCalled();
  });

  it("fails Zoho method with missing invoice identifier", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      payment_method: "zoho",
      payment_reference_external: null,
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_x",
      amountCents: 45000,
    });

    expect(result).toEqual({ kind: "failed", error: "missing_zoho_invoice_identifier" });
    expect(createZohoInvoiceMock).not.toHaveBeenCalled();
  });

  it("fails Zoho method when invoice does not exist / read fails", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      payment_method: "zoho",
      payment_reference_external: "missing-inv",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C" },
    });
    lookupZohoCustomerContactIdMock.mockResolvedValue("zc1");
    getZohoInvoiceMock.mockResolvedValue({ ok: false, error: "not_found" });

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_missing-inv",
      amountCents: 45000,
    });

    expect(result).toEqual({
      kind: "failed",
      error: "zoho_invoice_read_failed:not_found",
    });
  });

  it("Zoho method: correct match returns synced and links booking", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      payment_method: "zoho",
      payment_reference_external: "z1",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
      total_paid_zar: 450,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C" },
    });
    lookupZohoCustomerContactIdMock.mockResolvedValue("zc1");
    getZohoInvoiceMock.mockResolvedValue(paidMatchingInvoice());

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_z1",
      amountCents: 45000,
    });

    expect(result).toEqual({
      kind: "synced",
      zohoInvoiceId: "z1",
      zohoInvoiceNumber: "INV-1",
      balanceCents: 0,
      status: "paid",
    });
    expect(upsertInvoiceSyncMetadataMock).toHaveBeenCalledTimes(1);
    expect((admin as { _updateEq: ReturnType<typeof vi.fn> })._updateEq).toHaveBeenCalled();
  });

  it("Zoho method: amount mismatch does not sync or link", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      payment_method: "zoho",
      payment_reference_external: "z1",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C" },
    });
    lookupZohoCustomerContactIdMock.mockResolvedValue("zc1");
    getZohoInvoiceMock.mockResolvedValue(paidMatchingInvoice({ totalCents: 10000 }));

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_z1",
      amountCents: 45000,
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error).toContain("zoho_invoice_amount_mismatch");
    expect(upsertInvoiceSyncMetadataMock).not.toHaveBeenCalled();
    expect((admin as { _updateEq: ReturnType<typeof vi.fn> })._updateEq).not.toHaveBeenCalled();
  });

  it("Zoho method: currency mismatch blocks sync", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      payment_method: "zoho",
      payment_reference_external: "z1",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C" },
    });
    lookupZohoCustomerContactIdMock.mockResolvedValue("zc1");
    getZohoInvoiceMock.mockResolvedValue(paidMatchingInvoice({ currencyCode: "USD" }));

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_z1",
      amountCents: 45000,
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error).toContain("zoho_invoice_currency_mismatch");
  });

  it("Zoho method: customer mismatch / missing expected contact blocks sync", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      payment_method: "zoho",
      payment_reference_external: "z1",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C" },
    });
    lookupZohoCustomerContactIdMock.mockResolvedValue("zc1");
    getZohoInvoiceMock.mockResolvedValue(paidMatchingInvoice({ customerId: "someone-else" }));

    const mismatch = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_z1",
      amountCents: 45000,
    });
    expect(mismatch.kind).toBe("failed");
    if (mismatch.kind === "failed") expect(mismatch.error).toContain("zoho_invoice_customer_mismatch");

    lookupZohoCustomerContactIdMock.mockResolvedValue(null);
    const missing = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_z1",
      amountCents: 45000,
    });
    expect(missing).toEqual({ kind: "failed", error: "zoho_invoice_expected_customer_missing" });
    expect(getZohoInvoiceMock).toHaveBeenCalledTimes(1);
  });

  it("Zoho method: paid with non-zero balance blocks sync", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      payment_method: "zoho",
      payment_reference_external: "z1",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C" },
    });
    lookupZohoCustomerContactIdMock.mockResolvedValue("zc1");
    getZohoInvoiceMock.mockResolvedValue(paidMatchingInvoice({ balanceCents: 50 }));

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_z1",
      amountCents: 45000,
    });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.error).toContain("zoho_invoice_not_paid_zero_balance");
  });

  it("Zoho method replay is idempotent for matching paid invoice", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      payment_method: "zoho",
      payment_reference_external: "z1",
      zoho_invoice_id: "z1",
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C" },
    });
    lookupZohoCustomerContactIdMock.mockResolvedValue("zc1");
    getZohoInvoiceMock.mockResolvedValue(paidMatchingInvoice());

    const first = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_z1",
      amountCents: 45000,
    });
    const second = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "zoho_z1",
      amountCents: 45000,
    });

    expect(first.kind).toBe("synced");
    expect(second).toEqual(first);
    expect(getZohoInvoiceMock).toHaveBeenCalledTimes(2);
    expect(createZohoInvoiceMock).not.toHaveBeenCalled();
  });

  it("returns synced only after allocation + authoritative paid zero settlement match", async () => {
    const admin = makeAdmin({
      customer_id: "u1",
      customer_email: "c@example.com",
      customer_name: "C",
      total_paid_zar: 450,
      payment_method: "cash",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
    resolveZohoCustomerContactForBookingMock.mockResolvedValue({
      ok: true,
      contact: { email: "c@example.com", name: "C", phone: null },
    });
    createZohoInvoiceMock.mockResolvedValue({
      ok: true,
      zohoInvoiceId: "z1",
      invoiceNumber: "INV-1",
    });
    markZohoInvoicePaidMock.mockResolvedValue({ ok: true, paymentId: "p1" });
    getZohoInvoiceMock.mockResolvedValue(paidMatchingInvoice());

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "cash_b1",
      amountCents: 45000,
    });

    expect(result).toEqual({
      kind: "synced",
      zohoInvoiceId: "z1",
      zohoInvoiceNumber: "INV-1",
      balanceCents: 0,
      status: "paid",
    });
  });
});
