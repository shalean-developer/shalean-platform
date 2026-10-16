import { beforeEach, describe, expect, it, vi } from "vitest";
const { eligibility, claim, release, email, abandonedEmail, sms } = vi.hoisted(() => ({
  eligibility: vi.fn(), claim: vi.fn(), release: vi.fn(), email: vi.fn(), abandonedEmail: vi.fn(), sms: vi.fn(),
}));
const { recoveryEmail, expire } = vi.hoisted(() => ({ recoveryEmail: vi.fn(), expire: vi.fn() }));
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
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => null }));

import { deliverAdminPaymentLink } from "@/lib/admin/adminPaymentLinkDelivery";
import { processDueDeferredPaymentLinkEmails } from "@/lib/conversion/deferredPaymentLinkEmailQueue";
import { processAbandonCheckoutReminders } from "@/lib/conversion/abandonCheckoutReminder";
import { processPaymentRecoveryJob } from "@/lib/booking/processPaymentRecoveryJob";

const payload = { customerEmail: "customer@example.com", customerName: "Pat", serviceLabel: "Regular Cleaning",
  dateLabel: "2026-10-18", timeLabel: "09:00", amountZar: 458, paymentUrl: "https://checkout.paystack.com/test",
  bookingId: "booking-1", paystackReference: "bps_test" };
const wa = { customerName: "Pat", paymentLink: payload.paymentUrl, service: payload.serviceLabel, date: payload.dateLabel, time: payload.timeLabel };

function makeAdmin() {
  const updates: Record<string, unknown>[] = [];
  const admin = { from: (table: string) => {
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain),
      gte: vi.fn(() => chain), lte: vi.fn(() => chain), order: vi.fn(() => chain), in: vi.fn(() => chain),
      update: vi.fn((patch: Record<string, unknown>) => { updates.push(patch); return chain; }),
      maybeSingle: vi.fn(async () => ({ data: table === "booking_payment_recovery_jobs"
        ? { id: "job-1", status: "pending", attempts: 0 }
        : { id: "queue-1", status: "pending_payment", paystack_reference: "bps_test", payment_link_delivery: {} }, error: null })),
      limit: vi.fn(async () => ({ data: [{ id: "booking-1", customer_email: payload.customerEmail,
        customer_phone: "+27000000000", paystack_reference: "bps_test" }], error: null })),
    };
    return chain;
  }, rpc: vi.fn(async () => ({ data: [{ id: "queue-1", booking_id: "booking-1", processing_token: "token",
    email_payload: payload, phone: "+27000000000", wa_payload: wa, delivery_context: {} }], error: null })) };
  return { admin: admin as never, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  eligibility.mockResolvedValue({ allowed: true }); claim.mockResolvedValue(true);
  email.mockResolvedValue({ sent: true }); abandonedEmail.mockResolvedValue({ sent: true }); sms.mockResolvedValue({ ok: true });
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
  it("does not send the abandoned email after another job wins the first-reminder claim", async () => {
    claim.mockResolvedValue(false);
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(abandonedEmail).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
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
});
