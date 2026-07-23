import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminMarkBookingPaidOperationMock,
  syncPaidBookingSideEffectsMock,
  deliverPaymentAlreadyReceivedReceiptMock,
  logSystemEventMock,
  reportOperationalIssueMock,
} = vi.hoisted(() => ({
  adminMarkBookingPaidOperationMock: vi.fn(),
  syncPaidBookingSideEffectsMock: vi.fn(),
  deliverPaymentAlreadyReceivedReceiptMock: vi.fn(),
  logSystemEventMock: vi.fn(),
  reportOperationalIssueMock: vi.fn(),
}));

vi.mock("@/lib/booking/bookingOperations", () => ({
  adminMarkBookingPaidOperation: adminMarkBookingPaidOperationMock,
}));

vi.mock("@/lib/booking/syncPaidBookingSideEffects", () => ({
  syncPaidBookingSideEffects: syncPaidBookingSideEffectsMock,
}));

vi.mock("@/lib/admin/deliverPaymentAlreadyReceivedReceipt", () => ({
  deliverPaymentAlreadyReceivedReceipt: deliverPaymentAlreadyReceivedReceiptMock,
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: logSystemEventMock,
  reportOperationalIssue: reportOperationalIssueMock,
}));

import { settleAdminBookingPaymentAlreadyReceived } from "@/lib/admin/settleAdminBookingPaymentAlreadyReceived";

function makeAdmin(confirmRow: Record<string, unknown>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: confirmRow, error: null })),
        })),
      })),
    })),
  } as never;
}

function settledOp() {
  return {
    ok: true as const,
    bookingId: "b1",
    data: {
      variant: "full_settled" as const,
      settlement: {
        amount_cents: 45000,
        total_paid_zar: 450,
        method: "cash" as const,
        payment_reference_external: null,
        paystack_reference: "cash_b1",
        preserved_paystack_reference: "adm_ar_x",
      },
    },
  };
}

describe("settleAdminBookingPaymentAlreadyReceived", () => {
  beforeEach(() => {
    adminMarkBookingPaidOperationMock.mockReset();
    syncPaidBookingSideEffectsMock.mockReset();
    deliverPaymentAlreadyReceivedReceiptMock.mockReset();
    logSystemEventMock.mockReset();
    reportOperationalIssueMock.mockReset();
    delete process.env.ZOHO_CLIENT_ID;
    delete process.env.ZOHO_REFRESH_TOKEN;
  });

  it("settles, syncs invoice, confirms paid, then emails receipt only on provider accept", async () => {
    adminMarkBookingPaidOperationMock.mockResolvedValue(settledOp());
    syncPaidBookingSideEffectsMock.mockResolvedValue({
      kind: "synced",
      zohoInvoiceId: "z1",
      zohoInvoiceNumber: "INV-1",
      balanceCents: 0,
      status: "paid",
    });
    deliverPaymentAlreadyReceivedReceiptMock.mockResolvedValue({
      customerEmailSent: true,
      dedupeSkipped: false,
      failed: false,
      paidInvoiceIncluded: false,
    });

    const admin = makeAdmin({
      payment_completed_at: "2026-07-23T10:00:00Z",
      payment_status: "success",
      amount_paid_cents: 45000,
      zoho_invoice_id: "z1",
    });

    const result = await settleAdminBookingPaymentAlreadyReceived(admin, {
      bookingId: "b1",
      adminUserId: "admin-1",
      method: "cash",
      amountCents: 45000,
      customerEmail: "c@example.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(adminMarkBookingPaidOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceSync: "skip", settlementMode: "full" }),
    );
    expect(deliverPaymentAlreadyReceivedReceiptMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        bookingId: "b1",
        paymentReference: "cash_b1",
        zohoInvoiceId: "z1",
      }),
    );
    expect(result.receipt_email_sent).toBe(true);
    expect(result.receipt_kind).toBe("payment_confirmation_receipt");
    expect(result.paid_invoice_included).toBe(false);
    expect(result.zero_balance_confirmed).toBe(true);
  });

  it("sets receipt_email_sent false on Resend/provider failure", async () => {
    adminMarkBookingPaidOperationMock.mockResolvedValue(settledOp());
    syncPaidBookingSideEffectsMock.mockResolvedValue({ kind: "skipped", reason: "no_zoho_config" });
    deliverPaymentAlreadyReceivedReceiptMock.mockResolvedValue({
      customerEmailSent: false,
      dedupeSkipped: false,
      failed: true,
      error: "RESEND_API_KEY missing at runtime",
      paidInvoiceIncluded: false,
    });

    const admin = makeAdmin({
      payment_completed_at: "2026-07-23T10:00:00Z",
      payment_status: "success",
      amount_paid_cents: 45000,
      zoho_invoice_id: null,
    });

    const result = await settleAdminBookingPaymentAlreadyReceived(admin, {
      bookingId: "b1",
      adminUserId: "admin-1",
      method: "cash",
      amountCents: 45000,
      customerEmail: "c@example.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt_email_sent).toBe(false);
    expect(result.receipt_email_skipped_reason).toContain("RESEND_API_KEY");
    expect(result.notification.failed).toBe(true);
  });

  it("sets receipt_email_sent false on notification dedupe skip", async () => {
    adminMarkBookingPaidOperationMock.mockResolvedValue(settledOp());
    syncPaidBookingSideEffectsMock.mockResolvedValue({ kind: "skipped", reason: "no_zoho_config" });
    deliverPaymentAlreadyReceivedReceiptMock.mockResolvedValue({
      customerEmailSent: false,
      dedupeSkipped: true,
      failed: false,
      paidInvoiceIncluded: false,
    });

    const admin = makeAdmin({
      payment_completed_at: "2026-07-23T10:00:00Z",
      payment_status: "success",
      amount_paid_cents: 45000,
      zoho_invoice_id: null,
    });

    const result = await settleAdminBookingPaymentAlreadyReceived(admin, {
      bookingId: "b1",
      adminUserId: "admin-1",
      method: "cash",
      amountCents: 45000,
      customerEmail: "c@example.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt_email_sent).toBe(false);
    expect(result.notification.dedupeSkipped).toBe(true);
    expect(result.receipt_kind).toBe("payment_confirmation_receipt");
  });

  it("claims paid invoice only when PDF was included", async () => {
    adminMarkBookingPaidOperationMock.mockResolvedValue(settledOp());
    syncPaidBookingSideEffectsMock.mockResolvedValue({
      kind: "synced",
      zohoInvoiceId: "z1",
      zohoInvoiceNumber: "INV-1",
      balanceCents: 0,
      status: "paid",
    });
    deliverPaymentAlreadyReceivedReceiptMock.mockResolvedValue({
      customerEmailSent: true,
      dedupeSkipped: false,
      failed: false,
      paidInvoiceIncluded: true,
    });

    const admin = makeAdmin({
      payment_completed_at: "2026-07-23T10:00:00Z",
      payment_status: "success",
      amount_paid_cents: 45000,
      zoho_invoice_id: "z1",
    });

    const result = await settleAdminBookingPaymentAlreadyReceived(admin, {
      bookingId: "b1",
      adminUserId: "admin-1",
      method: "cash",
      amountCents: 45000,
      customerEmail: "c@example.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt_kind).toBe("paid_invoice");
    expect(result.paid_invoice_included).toBe(true);
  });

  it("does not email when invoice balance remains outstanding", async () => {
    process.env.ZOHO_CLIENT_ID = "id";
    process.env.ZOHO_REFRESH_TOKEN = "rt";
    adminMarkBookingPaidOperationMock.mockResolvedValue({
      ...settledOp(),
      data: {
        variant: "full_settled",
        settlement: {
          amount_cents: 45000,
          total_paid_zar: 450,
          method: "eft",
          payment_reference_external: "EFT-1",
          paystack_reference: "eft_EFT-1",
          preserved_paystack_reference: "adm_ar_x",
        },
      },
    });
    syncPaidBookingSideEffectsMock.mockResolvedValue({
      kind: "failed",
      error: "zoho_invoice_not_paid_zero_balance:status=sent:balanceCents=1200",
    });

    const admin = makeAdmin({
      payment_completed_at: "2026-07-23T10:00:00Z",
      payment_status: "success",
      amount_paid_cents: 45000,
      zoho_invoice_id: "z1",
    });

    const result = await settleAdminBookingPaymentAlreadyReceived(admin, {
      bookingId: "b1",
      adminUserId: "admin-1",
      method: "eft",
      reference: "EFT-1",
      amountCents: 45000,
      customerEmail: "c@example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("payment_already_received_invoice_sync_failed");
    expect(deliverPaymentAlreadyReceivedReceiptMock).not.toHaveBeenCalled();
  });

  it("does not skip Zoho method verification failures", async () => {
    process.env.ZOHO_CLIENT_ID = "id";
    process.env.ZOHO_REFRESH_TOKEN = "rt";
    adminMarkBookingPaidOperationMock.mockResolvedValue({
      ok: true,
      bookingId: "b1",
      data: {
        variant: "full_settled",
        settlement: {
          amount_cents: 45000,
          total_paid_zar: 450,
          method: "zoho",
          payment_reference_external: "bad-id",
          paystack_reference: "zoho_bad-id",
          preserved_paystack_reference: "adm_ar_x",
        },
      },
    });
    syncPaidBookingSideEffectsMock.mockResolvedValue({
      kind: "failed",
      error: "missing_zoho_invoice_identifier",
    });

    const admin = makeAdmin({
      payment_completed_at: "2026-07-23T10:00:00Z",
      payment_status: "success",
      amount_paid_cents: 45000,
      zoho_invoice_id: null,
    });

    const result = await settleAdminBookingPaymentAlreadyReceived(admin, {
      bookingId: "b1",
      adminUserId: "admin-1",
      method: "zoho",
      reference: "bad-id",
      amountCents: 45000,
      customerEmail: "c@example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("payment_already_received_invoice_sync_failed");
    expect(deliverPaymentAlreadyReceivedReceiptMock).not.toHaveBeenCalled();
  });
});
