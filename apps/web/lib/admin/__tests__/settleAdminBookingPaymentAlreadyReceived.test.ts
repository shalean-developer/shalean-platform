import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminMarkBookingPaidOperationMock,
  syncPaidBookingSideEffectsMock,
  notifyBookingEventMock,
  logSystemEventMock,
  reportOperationalIssueMock,
} = vi.hoisted(() => ({
  adminMarkBookingPaidOperationMock: vi.fn(),
  syncPaidBookingSideEffectsMock: vi.fn(),
  notifyBookingEventMock: vi.fn(),
  logSystemEventMock: vi.fn(),
  reportOperationalIssueMock: vi.fn(),
}));

vi.mock("@/lib/booking/bookingOperations", () => ({
  adminMarkBookingPaidOperation: adminMarkBookingPaidOperationMock,
}));

vi.mock("@/lib/booking/syncPaidBookingSideEffects", () => ({
  syncPaidBookingSideEffects: syncPaidBookingSideEffectsMock,
}));

vi.mock("@/lib/notifications/notifyBookingEvent", () => ({
  notifyBookingEvent: notifyBookingEventMock,
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

describe("settleAdminBookingPaymentAlreadyReceived", () => {
  beforeEach(() => {
    adminMarkBookingPaidOperationMock.mockReset();
    syncPaidBookingSideEffectsMock.mockReset();
    notifyBookingEventMock.mockReset();
    logSystemEventMock.mockReset();
    reportOperationalIssueMock.mockReset();
    delete process.env.ZOHO_CLIENT_ID;
    delete process.env.ZOHO_REFRESH_TOKEN;
  });

  it("settles, syncs invoice, confirms paid, then emails receipt", async () => {
    adminMarkBookingPaidOperationMock.mockResolvedValue({
      ok: true,
      bookingId: "b1",
      data: {
        variant: "full_settled",
        settlement: {
          amount_cents: 45000,
          total_paid_zar: 450,
          method: "cash",
          payment_reference_external: null,
          paystack_reference: "cash_b1",
          preserved_paystack_reference: "adm_ar_x",
        },
      },
    });
    syncPaidBookingSideEffectsMock.mockResolvedValue({
      kind: "synced",
      zohoInvoiceId: "z1",
      zohoInvoiceNumber: "INV-1",
      balanceCents: 0,
      status: "paid",
    });
    notifyBookingEventMock.mockResolvedValue(undefined);

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
    expect(syncPaidBookingSideEffectsMock).toHaveBeenCalled();
    expect(notifyBookingEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_confirmed",
        bookingId: "b1",
        paymentReference: "cash_b1",
      }),
    );
    expect(result.receipt_email_sent).toBe(true);
    expect(result.zero_balance_confirmed).toBe(true);
  });

  it("does not email when invoice balance remains outstanding", async () => {
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
          method: "eft",
          payment_reference_external: "EFT-1",
          paystack_reference: "eft_EFT-1",
          preserved_paystack_reference: "adm_ar_x",
        },
      },
    });
    syncPaidBookingSideEffectsMock.mockResolvedValue({
      kind: "synced",
      zohoInvoiceId: "z1",
      zohoInvoiceNumber: "INV-1",
      balanceCents: 1200,
      status: "sent",
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
    expect(result.code).toBe("payment_already_received_invoice_balance_nonzero");
    expect(notifyBookingEventMock).not.toHaveBeenCalled();
  });

  it("does not email when Zoho sync fails while Zoho is configured", async () => {
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
          method: "cash",
          payment_reference_external: null,
          paystack_reference: "cash_b1",
          preserved_paystack_reference: "adm_ar_x",
        },
      },
    });
    syncPaidBookingSideEffectsMock.mockResolvedValue({
      kind: "failed",
      error: "zoho_down",
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

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("payment_already_received_invoice_sync_failed");
    expect(notifyBookingEventMock).not.toHaveBeenCalled();
  });
});
