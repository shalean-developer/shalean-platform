import { beforeEach, describe, expect, it, vi } from "vitest";
const { eligibility, claim, release, email, abandonedEmail, sms } = vi.hoisted(() => ({
  eligibility: vi.fn(), claim: vi.fn(), release: vi.fn(), email: vi.fn(), abandonedEmail: vi.fn(), sms: vi.fn(),
}));
const { recoveryEmail, expire, adminMock, persist } = vi.hoisted(() => ({ recoveryEmail: vi.fn(), expire: vi.fn(), adminMock: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/email/paymentRecoveryEmails", () => ({ buildPaymentRecoveryEmailContext: vi.fn(), sendPaymentRecoveryEmail: recoveryEmail }));
vi.mock("@/lib/booking/expirePendingPaymentTerminal", () => ({ expirePendingPaymentTerminal: expire }));
vi.mock("@/lib/pay/paymentLinkEligibility", () => ({ checkPaymentLinkEligibility: eligibility,
  claimAutomaticPaymentReminder: claim, releaseAutomaticPaymentReminder: release }));
vi.mock("@/lib/email/sendBookingEmail", () => ({ sendPaymentLinkEmail: email, sendAbandonedCheckoutReminderEmail: abandonedEmail }));
vi.mock("@/lib/templates/customerOutbound", () => ({ sendCustomerSmsPaymentLink: sms }));
vi.mock("@/lib/conversion/assignConversionExperiment", () => ({
  assignConversionExperimentVariant: vi.fn(async () => ({ variant: "control" })),
  maybeDelayPaymentLinkEmailExperiment: vi.fn(),
}));
vi.mock("@/lib/ai-autonomy/optimizeTiming", () => ({ applySendDelayIfNeeded: vi.fn() }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: vi.fn() }));
vi.mock("@/lib/notifications/notificationEmailTelemetry", () => ({ logPipelineEmailTelemetry: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: adminMock }));
vi.mock("@/lib/cron/cronLock", () => ({ acquireCronLock: vi.fn(async () => ({ ok: true, jobName: "reminders", holderId: "lock" })), releaseCronLock: vi.fn() }));
vi.mock("@/lib/customer/customerBookingsForUser", () => ({ resolveBookingOwnershipColumn: vi.fn(async () => "customer_id") }));
vi.mock("@/lib/pay/priorPaymentConversionBucket", () => ({ priorPaymentConversionBucketForCustomer: vi.fn(async () => null) }));
vi.mock("@/lib/pay/paymentDecisionDispatch", () => ({ fetchRecentPaymentLinkChannelStats: vi.fn(async () => ({})),
  resolvePaymentLinkDispatchDecision: vi.fn(async () => ({ send_now: true, phoneTryOrder: [] })), recordPaymentLinkDecision: vi.fn() }));
vi.mock("@/lib/admin/persistPaymentLinkDelivery", () => ({ persistPaymentLinkDelivery: persist }));

import { deliverAdminPaymentLink } from "@/lib/admin/adminPaymentLinkDelivery";
import { processDueDeferredPaymentLinkEmails } from "@/lib/conversion/deferredPaymentLinkEmailQueue";
import { processAbandonCheckoutReminders } from "@/lib/conversion/abandonCheckoutReminder";
import { processPaymentRecoveryJob } from "@/lib/booking/processPaymentRecoveryJob";
import { POST as runReminderCron } from "@/app/api/cron/payment-link-reminders/route";

const payload = { customerEmail: "customer@example.com", customerName: "Pat", serviceLabel: "Regular Cleaning",
  dateLabel: "2026-10-18", timeLabel: "09:00", amountZar: 458, paymentUrl: "https://checkout.paystack.com/test",
  bookingId: "booking-1", paystackReference: "bps_test" };
const wa = { customerName: "Pat", paymentLink: payload.paymentUrl, service: payload.serviceLabel, date: payload.dateLabel, time: payload.timeLabel };

function makeAdmin(reference: string | null = "bps_test") {
  const updates: Record<string, unknown>[] = [];
  const admin = { from: (table: string) => {
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain),
      gte: vi.fn(() => chain), lte: vi.fn(() => chain), order: vi.fn(() => chain), in: vi.fn(() => chain),
      update: vi.fn((patch: Record<string, unknown>) => { updates.push(patch); return chain; }),
      maybeSingle: vi.fn(async () => ({ data: table === "booking_payment_recovery_jobs"
        ? { id: "job-1", status: "pending", attempts: 0 }
        : { id: "queue-1", status: "pending_payment", paystack_reference: "bps_test", payment_link_delivery: {} }, error: null })),
      limit: vi.fn(async () => ({ data: [{ id: "booking-1", customer_email: payload.customerEmail,
        customer_phone: "+27000000000", paystack_reference: reference }], error: null })),
    };
    return chain;
  }, rpc: vi.fn(async () => ({ data: [{ id: "queue-1", booking_id: "booking-1", processing_token: "token",
    email_payload: payload, phone: "+27000000000", wa_payload: wa, delivery_context: {} }], error: null })) };
  return { admin: admin as never, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  eligibility.mockResolvedValue({ allowed: true }); claim.mockResolvedValue(true);
  adminMock.mockReturnValue(null); persist.mockReset();
  email.mockResolvedValue({ sent: true }); abandonedEmail.mockResolvedValue({ sent: true }); sms.mockResolvedValue({ ok: true });
});

function cronAdmin() {
  const chain = { select: () => chain, eq: () => chain, not: () => chain, gte: () => chain, lte: () => chain,
    update: vi.fn(() => chain), limit: async () => ({ error: null, data: [{ id: "booking-1", customer_email: payload.customerEmail,
      paystack_reference: "bps_test", payment_link: payload.paymentUrl, payment_link_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      total_price: 458, payment_link_send_count: 0 }] }) };
  return { from: () => chain };
}

describe("reminder cron claim lifetime", () => {
  const request = () => new Request("https://example.com/api/cron/payment-link-reminders", { method: "POST", headers: { authorization: "Bearer test" } });
  beforeEach(() => { vi.stubEnv("CRON_SECRET", "test"); adminMock.mockReturnValue(cronAdmin()); });
  it("releases its claim after an exception before delivery", async () => {
    email.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await runReminderCron(request())).status).toBe(200);
    expect(release).toHaveBeenCalledWith(expect.anything(), "bps_test", "first");
  });
  it("retains its claim when persistence fails after accepted delivery", async () => {
    persist.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await runReminderCron(request())).status).toBe(200);
    expect(email).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled();
  });
  it("retains its claim when delivery telemetry fails after provider acceptance", async () => {
    const { logSystemEvent } = await import("@/lib/logging/systemLog");
    vi.mocked(logSystemEvent).mockRejectedValueOnce(new Error("telemetry unavailable"));
    expect((await runReminderCron(request())).status).toBe(200);
    expect(email).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled();
  });
});

describe("actual payment message entry points", () => {
  it("suppresses both email and SMS in admin/reminder delivery when payment succeeded", async () => {
    eligibility.mockResolvedValue({ allowed: false, reason: "gateway_paid" });
    const result = await deliverAdminPaymentLink({ phone: "+27000000000", email: payload.customerEmail,
      emailPayload: payload, waPayload: wa, context: { stage: "reminder_1h" }, mode: "chain",
      supabaseAdmin: makeAdmin().admin, bookingId: "booking-1" });
    expect(result.fallbackTrace).toBe("payment_link_suppressed:gateway_paid");
    expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("rechecks before fallback SMS when payment succeeds during the failed email attempt", async () => {
    eligibility.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "booking_paid" });
    email.mockResolvedValue({ sent: false, error: "temporary_email_failure" });
    await deliverAdminPaymentLink({ phone: "+27000000000", email: payload.customerEmail, emailPayload: payload,
      waPayload: wa, context: { stage: "reminder_1h" }, mode: "chain", supabaseAdmin: makeAdmin().admin, bookingId: "booking-1" });
    expect(email).toHaveBeenCalledOnce(); expect(sms).not.toHaveBeenCalled();
  });
  it("retires a queued payment email after payment, without SMS fallback", async () => {
    eligibility.mockResolvedValue({ allowed: false, reason: "booking_paid" });
    const { admin, updates } = makeAdmin();
    const result = await processDueDeferredPaymentLinkEmails(admin);
    expect(result).toMatchObject({ processed: 1, emailed: 0, smsFallback: 0, errors: 0 });
    expect(updates).toContainEqual(expect.objectContaining({ last_error: "suppressed:booking_paid", processing_token: null }));
    expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("suppresses abandoned-checkout recovery after payment", async () => {
    eligibility.mockResolvedValue({ allowed: false, reason: "gateway_paid" });
    const result = await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(result.sent).toBe(0); expect(claim).not.toHaveBeenCalled();
    expect(abandonedEmail).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("uses the shared first-reminder claim and sends no SMS when email succeeds", async () => {
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(claim).toHaveBeenCalledWith(expect.anything(), "booking-1", "bps_test", "first");
    expect(abandonedEmail).toHaveBeenCalledOnce(); expect(sms).not.toHaveBeenCalled();
  });
  it("keeps checkout recovery available before a gateway reference has been created", async () => {
    await processAbandonCheckoutReminders(makeAdmin(null).admin);
    expect(eligibility).toHaveBeenCalledWith(expect.anything(), "booking-1", "", { allowUninitialized: true });
    expect(claim).toHaveBeenCalledWith(expect.anything(), "booking-1", "checkout:booking-1", "first");
    expect(abandonedEmail).toHaveBeenCalledWith(expect.objectContaining({ checkoutUrl: expect.stringMatching(/\/book(?:\?|$)/) }));
  });
  it("does not send the abandoned email after another job wins the first-reminder claim", async () => {
    claim.mockResolvedValue(false);
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(abandonedEmail).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("releases an abandoned reminder claim when the SMS eligibility recheck is transient", async () => {
    abandonedEmail.mockResolvedValue({ sent: false });
    eligibility.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "gateway_unavailable", retryable: true });
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(sms).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(expect.anything(), "bps_test", "first");
  });
  it("releases an abandoned reminder claim after a provider exception", async () => {
    abandonedEmail.mockRejectedValueOnce(new Error("provider unavailable"));
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(release).toHaveBeenCalledWith(expect.anything(), "bps_test", "first");
  });
  it("retains the abandoned reminder claim after accepted email and telemetry failure", async () => {
    const { logPipelineEmailTelemetry } = await import("@/lib/notifications/notificationEmailTelemetry");
    vi.mocked(logPipelineEmailTelemetry).mockRejectedValueOnce(new Error("telemetry unavailable"));
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(release).not.toHaveBeenCalled();
    expect(sms).not.toHaveBeenCalled();
  });
  it("records provider acceptance before delivery telemetry can throw", async () => {
    const { logSystemEvent } = await import("@/lib/logging/systemLog");
    vi.mocked(logSystemEvent).mockRejectedValueOnce(new Error("telemetry unavailable"));
    const accepted = vi.fn();
    await expect(deliverAdminPaymentLink({ phone: null, email: payload.customerEmail, emailPayload: payload,
      waPayload: wa, context: { stage: "reminder_1h" }, mode: "chain", supabaseAdmin: makeAdmin().admin,
      bookingId: "booking-1", onDeliveryAccepted: accepted })).rejects.toThrow("telemetry unavailable");
    expect(accepted).toHaveBeenCalledOnce();
  });
  it.each(["payment_reminder_1h", "payment_reminder_24h", "booking_payment_expired"])(
    "suppresses legacy %s jobs before email or expiration when Paystack is paid", async (jobType) => {
      eligibility.mockResolvedValue({ allowed: false, reason: "gateway_paid" });
      const result = await processPaymentRecoveryJob(makeAdmin().admin, { id: "job-1", booking_id: "booking-1",
        job_type: jobType, customer_email: "customer@example.com", attempts: 0 });
      expect(result).toBe("skipped"); expect(recoveryEmail).not.toHaveBeenCalled(); expect(expire).not.toHaveBeenCalled();
    });
  it("retries an unverified deferred payment request without sending email or SMS", async () => {
    eligibility.mockResolvedValue({ allowed: false, reason: "gateway_unavailable", retryable: true });
    const { admin, updates } = makeAdmin();
    const result = await processDueDeferredPaymentLinkEmails(admin);
    expect(result.retriesScheduled).toBe(1);
    expect(updates).toContainEqual(expect.objectContaining({ last_error: "eligibility:gateway_unavailable", processing_token: null }));
    expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("retries a deferred request when the SMS eligibility recheck is transient", async () => {
    email.mockResolvedValue({ sent: false, error: "email_unavailable" });
    eligibility.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "gateway_unavailable", retryable: true });
    const result = await processDueDeferredPaymentLinkEmails(makeAdmin().admin);
    expect(result.retriesScheduled).toBe(1);
    expect(sms).not.toHaveBeenCalled();
  });
});
