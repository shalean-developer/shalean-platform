import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  sendBookingConfirmationEmailMock,
  tryClaimNotificationIdempotencyMock,
  releaseNotificationIdempotencyClaimMock,
  logSystemEventMock,
  reportOperationalIssueMock,
  logPipelineEmailTelemetryMock,
  logPaymentStructuredMock,
  adminEmailMock,
  inAppMock,
  customerSmsMock,
  enqueueMock,
  contactHealthMock,
} = vi.hoisted(() => ({
  sendBookingConfirmationEmailMock: vi.fn(),
  tryClaimNotificationIdempotencyMock: vi.fn(),
  releaseNotificationIdempotencyClaimMock: vi.fn(),
  logSystemEventMock: vi.fn(),
  reportOperationalIssueMock: vi.fn(),
  logPipelineEmailTelemetryMock: vi.fn(),
  logPaymentStructuredMock: vi.fn(),
  adminEmailMock: vi.fn(async () => ({ sent: true })),
  inAppMock: vi.fn(async () => undefined),
  customerSmsMock: vi.fn(async () => ({ ok: true })),
  enqueueMock: vi.fn(async () => true),
  contactHealthMock: vi.fn(async () => null),
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
  sendAdminEmailWithDbTemplateFallback: adminEmailMock,
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
  enqueueFailedJob: enqueueMock,
  PAYMENT_CONFIRMATION_NOTIFICATION_JOB: "payment_confirmation_notification",
}));

vi.mock("@/lib/customer/customerBookingsForUser", () => ({
  resolveBookingOwnershipColumn: vi.fn(async () => "customer_id"),
}));

vi.mock("@/lib/ai-autonomy/optimizeTiming", () => ({
  applyFallbackDelayIfNeeded: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/customerUserNotifications", () => ({
  notifyCustomerBookingPlaced: inAppMock,
  notifyCustomerCleanerAssigned: vi.fn(async () => undefined),
}));
vi.mock("@/lib/templates/customerOutbound", () => ({ sendCustomerSmsFromTemplate: customerSmsMock }));
vi.mock("@/lib/notifications/customerContactHealth", () => ({ getCustomerContactHealthScore: contactHealthMock }));

import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { buildBookingConfirmedTemplateData } from "@/lib/templates/bookingConfirmedData";

afterEach(() => vi.unstubAllEnvs());

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
    adminEmailMock.mockClear();
    inAppMock.mockClear();
    customerSmsMock.mockClear();
    enqueueMock.mockClear();
    contactHealthMock.mockClear();
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
        customer_phone: "+27000000000",
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
    expect(customerSmsMock).not.toHaveBeenCalled();
  });

  it("loads canonical ownership and complete booking details when Paystack metadata is sparse", async () => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true);
    sendBookingConfirmationEmailMock.mockResolvedValue({ sent: true });
    const admin = makeAdmin({
      customer_id: "customer-1", customer_email: "pat@example.com", customer_name: "Pat Customer",
      service: "regular-cleaning", date: "2026-10-18", time: "09:00", location: "12 Example Road",
      suburb: "Claremont", booking_reference: "SHL-BK-009999", booking_snapshot: {},
    });
    const result = await notifyBookingEvent({ type: "payment_confirmed", supabase: admin,
      bookingId: "b1", snapshot: null, customerEmail: "pat@example.com", amountCents: 45800, paymentReference: "bps_test" });
    expect(result.customerEmailSent).toBe(true);
    expect(sendBookingConfirmationEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      customerName: "Pat Customer", serviceLabel: "Regular Cleaning", timeLabel: "09:00",
      location: "12 Example Road, Claremont", bookingReference: "SHL-BK-009999", totalPaidZar: 458,
      dateLabel: expect.stringContaining("18"),
    }));
    const selects = vi.mocked((admin as unknown as { from: ReturnType<typeof vi.fn> }).from).mock.results
      .flatMap((entry) => entry.value.select.mock.calls.map((call: string[]) => call[0]));
    expect(selects[0]).toContain("customer_id");
    expect(selects[0]).not.toMatch(/\buser_id\b/);
    expect(inAppMock).toHaveBeenCalledWith(admin, expect.objectContaining({ userId: "customer-1", bookingId: "b1" }));
    expect(buildBookingConfirmedTemplateData(sendBookingConfirmationEmailMock.mock.calls[0][0])).toMatchObject({
      customer_name: "Pat Customer", booking_reference: "SHL-BK-009999", service_name: "Regular Cleaning",
      booking_date: "Sunday, 18 Oct", booking_time: "09:00", booking_address: "12 Example Road, Claremont",
    });
  });

  it("reports a booking query failure instead of emailing fabricated Pending details", async () => {
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: null, error: { message: "database unavailable" },
    }) }) }) }) } as never;
    const result = await notifyBookingEvent({ type: "payment_confirmed", supabase: admin,
      bookingId: "b1", snapshot: null, customerEmail: "pat@example.com", amountCents: 45800, paymentReference: "bps_test" });
    expect(result.failed).toBe(true);
    expect(result.error).toContain("payment_confirmation_booking_load_failed");
    expect(sendBookingConfirmationEmailMock).not.toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith("payment_confirmation_notification", expect.objectContaining({ bookingId: "b1", paymentReference: "bps_test", amountCents: 45800 }));
  });
  it("uses a snapshot phone when the stored phone is blank and confirmation email fails", async () => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true);
    sendBookingConfirmationEmailMock.mockResolvedValue({ sent: false, error: "email_unavailable" });
    await notifyBookingEvent({ type: "payment_confirmed", supabase: makeAdmin({ customer_email: "pat@example.com", customer_phone: "  " }),
      bookingId: "b1", snapshot: { ...snapshot, customer: { ...snapshot.customer!, phone: "+27000000000" } },
      customerEmail: "pat@example.com", amountCents: 45000, paymentReference: "bps_phone_test" });
    expect(customerSmsMock).toHaveBeenCalledWith(expect.objectContaining({ phone: "+27000000000", smsRole: "fallback" }));
  });
  it("keeps a worker replay on its existing durable job after another enrichment failure", async () => {
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "offline" } }) }) }) }) } as never;
    const result = await notifyBookingEvent({ type: "payment_confirmed", supabase: admin, bookingId: "b1", snapshot: null,
      customerEmail: "pat@example.com", amountCents: 45800, paymentReference: "bps_retry", confirmationRetry: true });
    expect(result.failed).toBe(true); expect(enqueueMock).not.toHaveBeenCalled();
  });
  it("completes a phone-only confirmation after SMS acceptance without an email retry", async () => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true);
    const result = await notifyBookingEvent({ type: "payment_confirmed", supabase: makeAdmin({ customer_phone: "+27000000000" }),
      bookingId: "b1", snapshot: null, customerEmail: "", amountCents: 45800, paymentReference: "bps_phone_only" });
    expect(result).toMatchObject({ failed: false, customerEmailSent: false });
    expect(customerSmsMock).toHaveBeenCalledOnce(); expect(enqueueMock).not.toHaveBeenCalled();
  });
  it.each(["failure", "exception"])("releases an SMS claim after %s so the worker can retry", async (kind) => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true);
    if (kind === "failure") customerSmsMock.mockResolvedValueOnce({ ok: false });
    else customerSmsMock.mockRejectedValueOnce(new Error("SMS unavailable"));
    const input = { type: "payment_confirmed" as const, supabase: makeAdmin({ customer_phone: "+27000000000" }),
      bookingId: "b1", snapshot: null, customerEmail: "", amountCents: 45800, paymentReference: "bps_sms_retry" };
    expect((await notifyBookingEvent(input)).failed).toBe(true);
    expect(releaseNotificationIdempotencyClaimMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channel: "sms" }));
    expect((await notifyBookingEvent({ ...input, confirmationRetry: true })).failed).toBe(false);
    expect(customerSmsMock).toHaveBeenCalledTimes(2);
  });
  it("retries failed in-app delivery while preserving the accepted email claim", async () => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true); sendBookingConfirmationEmailMock.mockResolvedValue({ sent: true });
    inAppMock.mockRejectedValueOnce(new Error("in-app unavailable"));
    const input = { type: "payment_confirmed" as const, supabase: makeAdmin({ customer_id: "customer-1", customer_email: "pat@example.com", customer_phone: "+27000000000" }),
      bookingId: "b1", snapshot: null, customerEmail: "pat@example.com", amountCents: 45800, paymentReference: "bps_inapp_retry" };
    expect((await notifyBookingEvent(input)).failed).toBe(true);
    expect(releaseNotificationIdempotencyClaimMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channel: "in_app" }));
    tryClaimNotificationIdempotencyMock.mockImplementation(async (_admin, claim) => claim.channel !== "email");
    expect((await notifyBookingEvent({ ...input, confirmationRetry: true })).failed).toBe(false);
    expect(inAppMock).toHaveBeenCalledTimes(2); expect(sendBookingConfirmationEmailMock).toHaveBeenCalledOnce(); expect(customerSmsMock).not.toHaveBeenCalled();
  });
  it("keeps failed office delivery retryable after customer email acceptance", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production"); vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "");
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true); sendBookingConfirmationEmailMock.mockResolvedValue({ sent: true });
    adminEmailMock.mockResolvedValueOnce({ sent: false });
    const input = { type: "payment_confirmed" as const, supabase: makeAdmin({ customer_email: "pat@example.com" }),
      bookingId: "b1", snapshot: null, customerEmail: "pat@example.com", amountCents: 45800, paymentReference: "bps_office_retry" };
    expect((await notifyBookingEvent(input)).failed).toBe(true);
    tryClaimNotificationIdempotencyMock.mockImplementation(async (_admin, claim) => claim.eventType === "payment_confirmed_admin");
    expect((await notifyBookingEvent({ ...input, confirmationRetry: true })).failed).toBe(false);
    expect(adminEmailMock).toHaveBeenCalledTimes(2); expect(sendBookingConfirmationEmailMock).toHaveBeenCalledOnce();
  });
  it("dispatches office alerts with the approved production fallback when the environment setting is absent", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production"); vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "");
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true);
    sendBookingConfirmationEmailMock.mockResolvedValue({ sent: true });
    await notifyBookingEvent({ type: "payment_confirmed", supabase: makeAdmin({ customer_email: "pat@example.com" }),
      bookingId: "b1", snapshot, customerEmail: "pat@example.com", amountCents: 45000, paymentReference: "bps_office_test" });
    expect(adminEmailMock).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "admin_payment_confirmed", bookingId: "b1" }));
  });
  it("finishes an office retry after a phone-only confirmation was already accepted", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production"); vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "");
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true); adminEmailMock.mockResolvedValueOnce({ sent: false });
    const input = { type: "payment_confirmed" as const, supabase: makeAdmin({ customer_phone: "+27000000000" }),
      bookingId: "b1", snapshot: null, customerEmail: "", amountCents: 45800, paymentReference: "bps_sms_office_retry" };
    expect((await notifyBookingEvent(input)).failed).toBe(true);
    tryClaimNotificationIdempotencyMock.mockImplementation(async (_admin, claim) => claim.channel !== "sms");
    expect((await notifyBookingEvent({ ...input, confirmationRetry: true })).failed).toBe(false);
    expect(customerSmsMock).toHaveBeenCalledOnce(); expect(adminEmailMock).toHaveBeenCalledTimes(2);
  });
  it("releases the SMS claim when pre-send contact enrichment throws", async () => {
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true); contactHealthMock.mockRejectedValueOnce(new Error("contact database offline"));
    const input = { type: "payment_confirmed" as const, supabase: makeAdmin({ customer_phone: "+27000000000" }),
      bookingId: "b1", snapshot: null, customerEmail: "", amountCents: 45800, paymentReference: "bps_sms_enrichment_retry" };
    expect((await notifyBookingEvent(input)).failed).toBe(true);
    expect(releaseNotificationIdempotencyClaimMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channel: "sms" }));
    expect(customerSmsMock).not.toHaveBeenCalled();
    expect((await notifyBookingEvent({ ...input, confirmationRetry: true })).failed).toBe(false);
  });
  it("retains an office retry and releases its claim when the sender throws", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production"); vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "");
    tryClaimNotificationIdempotencyMock.mockResolvedValue(true); sendBookingConfirmationEmailMock.mockResolvedValue({ sent: true });
    adminEmailMock.mockRejectedValueOnce(new Error("office sender unavailable"));
    const result = await notifyBookingEvent({ type: "payment_confirmed", supabase: makeAdmin({ customer_email: "pat@example.com" }),
      bookingId: "b1", snapshot: null, customerEmail: "pat@example.com", amountCents: 45800, paymentReference: "bps_office_throw" });
    expect(result.failed).toBe(true);
    expect(releaseNotificationIdempotencyClaimMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "payment_confirmed_admin" }));
    expect(enqueueMock).toHaveBeenCalledWith("payment_confirmation_notification", expect.anything());
  });
});
