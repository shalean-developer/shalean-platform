import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createZohoInvoiceMock,
  getZohoInvoiceMock,
  markZohoInvoicePaidMock,
  resolveZohoCustomerContactForBookingMock,
  upsertInvoiceSyncMetadataMock,
  provisionV2RecurringPlanMock,
  resolveBookingOwnershipColumnMock,
  logSystemEventMock,
} = vi.hoisted(() => ({
  createZohoInvoiceMock: vi.fn(),
  getZohoInvoiceMock: vi.fn(),
  markZohoInvoicePaidMock: vi.fn(),
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

describe("syncPaidBookingSideEffects Zoho verification", () => {
  beforeEach(() => {
    createZohoInvoiceMock.mockReset();
    getZohoInvoiceMock.mockReset();
    markZohoInvoicePaidMock.mockReset();
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

  it("returns failed for non-zero Zoho balance after allocation", async () => {
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
    getZohoInvoiceMock.mockResolvedValue({
      ok: true,
      zohoInvoiceId: "z1",
      invoiceNumber: "INV-1",
      status: "sent",
      totalCents: 45000,
      balanceCents: 45000,
      taxCents: 0,
      customerId: "zc1",
      currencyCode: "ZAR",
    });

    const result = await syncPaidBookingSideEffects(admin, {
      bookingId: "b1",
      reference: "eft_ref",
      amountCents: 45000,
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error).toContain("zoho_invoice_not_paid_zero_balance");
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
      payment_method: "zoho",
      payment_reference_external: "missing-inv",
      zoho_invoice_id: null,
      is_monthly_billing_booking: false,
      sales_document_id: null,
    });
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

  it("returns synced only after allocation + authoritative paid zero read", async () => {
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
    getZohoInvoiceMock.mockResolvedValue({
      ok: true,
      zohoInvoiceId: "z1",
      invoiceNumber: "INV-1",
      status: "paid",
      totalCents: 45000,
      balanceCents: 0,
      taxCents: 0,
      customerId: "zc1",
      currencyCode: "ZAR",
    });

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
