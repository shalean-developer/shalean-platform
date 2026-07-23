import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sendBookingConfirmationEmailMock,
  tryClaimNotificationIdempotencyMock,
  releaseNotificationIdempotencyClaimMock,
  logSystemEventMock,
  reportOperationalIssueMock,
  logPipelineEmailTelemetryMock,
  logPaymentStructuredMock,
} = vi.hoisted(() => ({
  sendBookingConfirmationEmailMock: vi.fn(),
  tryClaimNotificationIdempotencyMock: vi.fn(),
  releaseNotificationIdempotencyClaimMock: vi.fn(),
  logSystemEventMock: vi.fn(),
  reportOperationalIssueMock: vi.fn(),
  logPipelineEmailTelemetryMock: vi.fn(),
  logPaymentStructuredMock: vi.fn(),
}));

vi.mock("@/lib/email/sendBookingEmail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/sendBookingEmail")>();
  return {
    ...actual,
    sendBookingConfirmationEmail: sendBookingConfirmationEmailMock,
    sendAdminHtmlEmail: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/email/customerEmailFromTemplate", () => ({
  sendAdminEmailWithDbTemplateFallback: vi.fn(async () => ({ sent: true })),
}));

vi.mock("@/lib/notifications/notificationIdempotencyClaim", () => ({
  tryClaimNotificationIdempotency: tryClaimNotificationIdempotencyMock,
  releaseNotificationIdempotencyClaim: releaseNotificationIdempotencyClaimMock,
}));

vi.mock("@/lib/notifications/notificationDedupe", () => ({
  tryClaimNotificationDedupe: vi.fn(async () => true),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: logSystemEventMock,
  reportOperationalIssue: reportOperationalIssueMock,
}));

vi.mock("@/lib/notifications/notificationEmailTelemetry", () => ({
  logPipelineEmailTelemetry: logPipelineEmailTelemetryMock,
}));

vi.mock("@/lib/observability/paymentStructuredLog", () => ({
  logPaymentStructured: logPaymentStructuredMock,
}));

vi.mock("@/lib/booking/failedJobs", () => ({
  enqueueFailedJob: vi.fn(async () => undefined),
}));

vi.mock("@/lib/ai-autonomy/optimizeTiming", () => ({
  applyFallbackDelayIfNeeded: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/customerUserNotifications", () => ({
  notifyCustomerBookingPlaced: vi.fn(async () => undefined),
  notifyCustomerCleanerAssigned: vi.fn(async () => undefined),
}));

import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

function makeAdmin(row: Record<string, unknown> | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        })),
      })),
    })),
  } as never;
}

const snapshot: BookingSnapshotV1 = {
  v: 1,
  customer: {
    name: "Pat",
    email: "pat@example.com",
    phone: "",
    user_id: null,
    type: "login",
  },
  total_zar: 450,
};

describe("notifyBookingEvent payment_confirmed delivery result", () => {
  beforeEach(() => {
    sendBookingConfirmationEmailMock.mockReset();
    tryClaimNotificationIdempotencyMock.mockReset();
    releaseNotificationIdempotencyClaimMock.mockReset();
    logSystemEventMock.mockReset();
    reportOperationalIssueMock.mockReset();
    logPipelineEmailTelemetryMock.mockReset();
    logPaymentStructuredMock.mockReset();
    process.env.RESEND_API_KEY = "re_test";
  });

  it("returns customerEmailSent true only when Resend/provider accepts", async () => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true);
    sendBookingConfirmationEmailMock.mockResolvedValue({ sent: true });

    const result = await notifyBookingEvent({
      type: "payment_confirmed",
      supabase: makeAdmin({
        customer_email: "pat@example.com",
        booking_snapshot: snapshot,
      }),
      bookingId: "b1",
      snapshot,
      customerEmail: "pat@example.com",
      amountCents: 45000,
      paymentReference: "pay_1",
    });

    expect(result.customerEmailSent).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.dedupeSkipped).toBe(false);
  });

  it("returns failed on Resend failure and does not claim customerEmailSent", async () => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true);
    sendBookingConfirmationEmailMock.mockResolvedValue({
      sent: false,
      error: "resend_rejected",
    });

    const result = await notifyBookingEvent({
      type: "payment_confirmed",
      supabase: makeAdmin({
        customer_email: "pat@example.com",
        booking_snapshot: snapshot,
      }),
      bookingId: "b1",
      snapshot,
      customerEmail: "pat@example.com",
      amountCents: 45000,
      paymentReference: "pay_1",
    });

    expect(result.customerEmailSent).toBe(false);
    expect(result.failed).toBe(true);
    expect(result.error).toBe("resend_rejected");
    expect(releaseNotificationIdempotencyClaimMock).toHaveBeenCalled();
  });

  it("returns dedupeSkipped when idempotency claim is already taken", async () => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(false);

    const result = await notifyBookingEvent({
      type: "payment_confirmed",
      supabase: makeAdmin({
        customer_email: "pat@example.com",
        booking_snapshot: snapshot,
      }),
      bookingId: "b1",
      snapshot,
      customerEmail: "pat@example.com",
      amountCents: 45000,
      paymentReference: "pay_1",
    });

    expect(result.dedupeSkipped).toBe(true);
    expect(result.customerEmailSent).toBe(false);
    expect(sendBookingConfirmationEmailMock).not.toHaveBeenCalled();
  });
});
